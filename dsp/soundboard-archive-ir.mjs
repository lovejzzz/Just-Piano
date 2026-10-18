// Numerical IR generation from decoded archives and explicit render settings.
// This module accepts no native captures, descriptors, target buffers or paths.
import {constructSoundboardArchiveSources} from './soundboard-archive-source.mjs';
import {constructSoundboardModelConfig} from './soundboard-model-config.mjs';
import {constructSoundboardMicrophoneSources} from './soundboard-microphone-source.mjs';
import {constructSoundboardProcessingConfig} from './soundboard-processing-config.mjs';
import {constructSoundboardLidGains} from './soundboard-lid-gain.mjs';
import {initializeSoundboardFromConfig} from './soundboard-initialization.mjs';
import {constructSoundboardMatrices} from './soundboard-matrix-construction.mjs';
import {constructSoundboardReceiverGeometry} from './soundboard-receiver-geometry.mjs';
import {constructSoundboardObservationGroups} from './soundboard-observation-groups.mjs';
import {soundboardScalarControls} from './soundboard-scalar.mjs';
import {soundboardIrWeights} from './soundboard-ir-window.mjs';
import {computeSoundboardResponses} from './soundboard-response.mjs';
import {convertSoundboardResponses} from './soundboard-response-conversion.mjs';
import {trimSoundboardResponses} from './soundboard-response-trim.mjs';
import {filterSoundboardResponses} from './soundboard-response-filter.mjs';
import {blendSoundboardResponses} from './soundboard-response-blend.mjs';
import {processSoundboardLeadingSilence} from './soundboard-leading-silence.mjs';
import {prepareSoundboardSpectralPrefix} from './soundboard-spectral-prefix.mjs';
import {soundboardCurveGain} from './soundboard-curve-gain.mjs';
import {computeSoundboardInverseSpectrum} from './soundboard-inverse-spectrum.mjs';
import {reconstructSoundboardTime} from './soundboard-time-reconstruction.mjs';
import {normalizeSoundboardResponses} from './soundboard-response-normalization.mjs';
import {createSoundboardResamplingPlan,resampleSoundboardResponse} from './soundboard-resampling.mjs';
import {finalizeSoundboardDispatch} from './soundboard-dispatch-output.mjs';

export function generateSoundboardArchiveIRs(archive){
  if(!archive?.runtimeRates||!archive.microphones||!archive.modelFeatures)
    throw new RangeError('Complete archive, microphone and explicit render inputs required');
  const sources=constructSoundboardArchiveSources(archive);
  const groups=sources.components.map((source,component)=>{
    const configuration=constructSoundboardModelConfig({...source,component,runtimeRates:archive.runtimeRates});
    const view=new DataView(configuration.config.buffer),value=offset=>view.getFloat32(offset,true);
    const microphones=constructSoundboardMicrophoneSources(archive.microphones,source.model);
    const initialized=initializeSoundboardFromConfig(configuration.initializationConfig,configuration.bridge);
    const matrices=constructSoundboardMatrices(initialized.grid,initialized.matrixControls);
    const receivers=constructSoundboardReceiverGeometry({grid:initialized.grid,shape:matrices.shape,
      ...initialized.receiverControls,primary:microphones.primary,offsets:microphones.offsets,parents:microphones.parents,
      offsetScale:value(0x1c8),mirror:configuration.config[0x1d0]});
    const processing=constructSoundboardProcessingConfig({archive,microphones,geometry:receivers.geometry});
    const gains=constructSoundboardLidGains({curve:source.lidCurve,preset:source.preset,modelFamily:0}).output;
    const controls=soundboardScalarControls(initialized.propagationControls);
    const observations=constructSoundboardObservationGroups({grid:initialized.grid,geometry:receivers.geometry,gains,
      ...initialized.observationControls,steps:controls.steps,phaseMode:Boolean(configuration.config[0x1cc])}).observations;
    const raw=computeSoundboardResponses({propagation:{matrixA:matrices.matrixA,matrixC:matrices.matrixC,
      controls,weights:soundboardIrWeights(controls.steps),excitation:initialized.excitation.output,
      excitationIndex:initialized.grid.excitationIndex,captureBlockStarts:[]},observations}).outputs;
    let lastDelay=0;
    for(const observation of observations)for(const group of observation.groups)lastDelay=Math.max(lastDelay,group.offset);
    const converted=convertSoundboardResponses(raw,{...initialized.conversion,h:initialized.grid.h,tau:initialized.grid.tau,
      logicalLength:controls.steps+lastDelay+1}).outputs;
    const trimmed=trimSoundboardResponses(converted,initialized.grid.tau).outputs;
    const filtered=filterSoundboardResponses(trimmed,{sampleRate:value(0x24),cutoff:value(0x14c),
      adjustmentNumerator:value(0x88),adjustmentDenominator:value(0x1c8),channels:processing.channels}).outputs;
    const blended=blendSoundboardResponses(filtered,processing.blend).outputs;
    const leading=processSoundboardLeadingSilence(blended,processing.blend.leadingSilenceMode).outputs;
    const fftLengths=[];
    const shaped=leading.map((response,channel)=>{
      const prefix=prepareSoundboardSpectralPrefix(response,{tau:initialized.grid.tau,amount:microphones.amounts[channel],
        width:value(0x144),flags:microphones.flags[channel]});
      fftLengths.push(prefix.length);
      const globalGain=soundboardCurveGain(source.globalCurve,{length:prefix.magnitude.length,
        smoothingWidth:value(0x140),mix:microphones.mixes[channel],binSpacing:prefix.binSpacing}).output;
      const channelGain=soundboardCurveGain(microphones.curves[channel],{length:prefix.magnitude.length,
        smoothingWidth:40,mix:0,binSpacing:prefix.binSpacing}).output;
      const inverse=computeSoundboardInverseSpectrum(prefix,{power:value(0xe0),globalGain,channelGain});
      return reconstructSoundboardTime(response,prefix,inverse).output;
    });
    const normalized=normalizeSoundboardResponses(shaped,{gain:value(0x148),sampleRate:value(0x24),impulseMix:0});
    const outputRate=value(0x2c),plan=createSoundboardResamplingPlan(Math.fround(outputRate/value(0x24)),10);
    const resampled=normalized.outputs.map(response=>resampleSoundboardResponse(response,plan).output);
    const outputs=finalizeSoundboardDispatch(resampled,outputRate).outputs;
    return {component,outputs,normalizations:normalized.normalizations,outputRate,fftLengths,
      gridSize:initialized.grid.size,propagationSteps:controls.steps,matrixIterations:matrices.solve.iterations};
  });
  return {groups,nativeCapturesUsedForPrediction:false,nativeTargetBuffersUsedForPrediction:false,
    completeVoiceVerified:false,finalStereoAudioVerified:false};
}
