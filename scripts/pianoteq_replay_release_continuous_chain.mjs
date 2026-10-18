import {initializeZeroExtraDamping} from '../dsp/zero-extra-damping.mjs';
import {modalDampingShape} from '../dsp/modal-damping-profile.mjs';
import {sumModalEnergy} from '../dsp/modal-energy-pruning.mjs';
import {modalRenderConfiguration} from '../dsp/modal-render-configuration.mjs';
import {ModalRefreshPolicy} from '../dsp/modal-refresh-policy.mjs';
import {produceAuxiliaryMidSource} from './pianoteq_auxiliary_mid_producer.mjs';
import {writeTerminalArtifact} from './pianoteq_terminal_artifact.mjs';
import {initializeReleaseModel} from '../dsp/release-model-controls.mjs';
import {constructArchiveDurationTuning, archiveReleaseDuration} from '../dsp/archive-release-duration.mjs';
import {bindDurationSource} from './pianoteq_bind_duration_source.mjs';
import {bindArchiveExcitation} from './pianoteq_bind_archive_excitation.mjs';
import {nativeDoublePow} from '../dsp/native-double-pow.mjs';
import {bindPreparedSources} from './pianoteq_bind_prepared_sources.mjs';
import {terminalSlopesFromDecayRow} from '../dsp/archive-terminal-model.mjs';
import {verifyVoiceTailEnvelopes} from './pianoteq_replay_voice_tail_envelopes.mjs';
import {verifyConsumerCross} from './pianoteq_replay_consumer_cross.mjs';
import {verifyVoiceRattleAudio} from './pianoteq_replay_voice_rattle.mjs';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
import {writePostConsumerStems,writeVoiceRattleStems,writeVoiceTailStems} from './pianoteq_write_post_consumer_stems.mjs';
import {rattleDispatchRoute} from '../dsp/rattle-dispatch-control.mjs';
import {RattleControlState} from '../dsp/rattle-control-state.mjs';
import {validateCommitSlots} from './pianoteq_validate_commit_slots.mjs';
import {verifyConsumerInjection} from './pianoteq_replay_consumer_injection.mjs';
import {renderVoiceDelay} from '../dsp/voice-output-delay.mjs';
import {writeWorkerStems} from './pianoteq_write_worker_stems.mjs';
import {modalOnsetDuration,ModalOnsetEnvelope} from '../dsp/modal-onset-envelope.mjs';
import {constructModalOnsetInitialization} from '../dsp/modal-onset-initialization.mjs';
import {archiveVoicePitchControls} from '../dsp/archive-voice-pitch.mjs';
import {archiveModalDampingControls} from '../dsp/archive-modal-damping.mjs';
import {DynamicPitchTrajectory} from '../dsp/dynamic-pitch.mjs';
import {renderModalVoiceBlock} from '../dsp/modal-voice-block.mjs';
import {updateModalEnergyAndPrune} from '../dsp/modal-energy-pruning.mjs';
import {modalAngleGroup,projectModalHistory} from '../dsp/modal-initial.mjs';
import {transportModalBlock,bypassPostModalProcessor,redistributeModalGroups} from '../dsp/post-modal-transport.mjs';
import {modalPositionWeights,positionWeightWarmupBlocks} from '../dsp/modal-position-weights.mjs';
import {refreshDampedModes} from '../dsp/damped-modal-refresh.mjs';
import {initialModalGroup} from '../dsp/modal-initial.mjs';
import {advanceVoiceInitializationRandom} from '../dsp/voice-initial-random.mjs';
import {selectVoiceModes} from '../dsp/voice-mode-selection.mjs';
import {mapVoiceSource} from '../dsp/voice-source-mapping.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {mergeReleaseExcitation} from '../dsp/release-merged-excitation.mjs';
import {nativeScalarExp2f} from '../dsp/native-scalar-exp.mjs';
import {nativeScalarLog10f} from '../dsp/native-scalar-log10.mjs';
import {buildReleaseControlledSupport} from '../dsp/release-controlled-support.mjs';
import {buildReleaseControlledSpectrum} from '../dsp/release-controlled-spectrum.mjs';
import {repeatedStrikeControl} from '../dsp/repeated-strike-control.mjs';
import {DynamicReleaseVoice} from '../dsp/dynamic-release-voice.mjs';
import {releaseLinkSuppressed} from '../dsp/midi-key-release-timeline.mjs';
const [capture,output,option,...extra]=process.argv.slice(2);
let randomWordChecks=0,doubleChecks=0;const initializationRandom=[];const weightDiagnostics=[];const initialStates=new Map(),initialSnapshots=[];let initialGroups=0;let refreshes=0,renderedBlocks=0,comparedOutputBlocks=0,tailTwelveGroups=0;const modalOutputs=new Map(),continuousOutputs=[],removals=[];let transportTails;
let stemsDirectory,postStemsDirectory,resumeAuditPath,archiveRepeatModelPath,rattleStemsDirectory,tailStemsDirectory,preparedSourcePath,archiveSourcePath;
let computedReleaseModel=false,computedTerminalSlopes=false,computedOnsetInitialization=false,pitchSourcePath,dampingSourcePath,durationSourcePath;const durationModels=new Map(),terminalSlopeModels=new Map(),pitchModels=[],dampingModels=new Map(),releaseModels=new Map(),releaseModelSources=new Map();
let terminalArtifactDirectory,auxiliarySourceDirectory;
let computedReleaseWaveform=false,poisonReleaseWaveTarget=false;
let computedAuxiliaryWaveforms=false,poisonGeneratedWaveTarget=false,poisonGeneratedSelectionTarget=false;
let computedExtraGain=false,poisonExtraGainTarget=false,extraGainTargetPoisoned=false;const extraGainSources=new Map();
let computedDampingProfile=false,poisonDampingProfileTarget=false,dampingProfileTargetPoisoned=false;const dampingShapeCounts={normal:0,modified:0};
let computedHeaderRatios=false,poisonHeaderRatioTarget=false,headerRatioTargetPoisoned=false;
let computedModalClock=false,poisonModalClockTarget=false,modalClockTargetPoisoned=false;
let computedDispatch=false,poisonDispatchTarget=false,dispatchTargetPoisoned=false;const ownDispatchPolicies=new Map();
let computedKeyRelease=false,keyFrame=-1,keySuppressions=0;const keyManagerStates=new Map(),keyPublishedStates=new Map();
for(const flag of extra){
 if(flag.startsWith('--auxiliary-source=')&&auxiliarySourceDirectory===undefined){auxiliarySourceDirectory=flag.slice('--auxiliary-source='.length);if(!auxiliarySourceDirectory)throw Error('Explicit auxiliary source required');continue;}
 if(flag.startsWith('--terminal-artifact=')&&terminalArtifactDirectory===undefined){terminalArtifactDirectory=flag.slice('--terminal-artifact='.length);if(!terminalArtifactDirectory)throw Error('Nonempty terminal artifact directory required');continue;}
 if(flag==='--computed-release-model'&&!computedReleaseModel)computedReleaseModel=true;
 else if(flag==='--computed-release-waveform'&&!computedReleaseWaveform)computedReleaseWaveform=true;
 else if(flag==='--computed-auxiliary-waveforms'&&!computedAuxiliaryWaveforms)computedAuxiliaryWaveforms=true;
 else if(flag==='--poison-generated-wave-target'&&!poisonGeneratedWaveTarget)poisonGeneratedWaveTarget=true;
 else if(flag==='--poison-generated-selection-target'&&!poisonGeneratedSelectionTarget)poisonGeneratedSelectionTarget=true;
 else if(flag==='--poison-release-wave-target'&&!poisonReleaseWaveTarget)poisonReleaseWaveTarget=true;
 else if(flag==='--computed-extra-gain'&&!computedExtraGain)computedExtraGain=true;
 else if(flag==='--poison-extra-gain-target'&&!poisonExtraGainTarget)poisonExtraGainTarget=true;
 else if(flag==='--computed-damping-profile'&&!computedDampingProfile)computedDampingProfile=true;
 else if(flag==='--poison-damping-profile-target'&&!poisonDampingProfileTarget)poisonDampingProfileTarget=true;
 else if(flag==='--computed-header-ratios'&&!computedHeaderRatios)computedHeaderRatios=true;
 else if(flag==='--poison-header-ratio-target'&&!poisonHeaderRatioTarget)poisonHeaderRatioTarget=true;
 else if(flag==='--computed-modal-clock'&&!computedModalClock)computedModalClock=true;
 else if(flag==='--poison-modal-clock-target'&&!poisonModalClockTarget)poisonModalClockTarget=true;
 else if(flag==='--computed-dispatch'&&!computedDispatch)computedDispatch=true;
 else if(flag==='--poison-dispatch-target'&&!poisonDispatchTarget)poisonDispatchTarget=true;
 else if(flag==='--computed-key-release'&&!computedKeyRelease)computedKeyRelease=true;
 else if(flag==='--computed-terminal-slopes'&&!computedTerminalSlopes)computedTerminalSlopes=true;
 else if(flag==='--computed-onset-initialization'&&!computedOnsetInitialization)computedOnsetInitialization=true;
 else if(flag.startsWith('--pitch-source=')&&pitchSourcePath===undefined)pitchSourcePath=flag.slice('--pitch-source='.length);
 else if(flag.startsWith('--damping-source=')&&dampingSourcePath===undefined)dampingSourcePath=flag.slice('--damping-source='.length);
 else if(flag.startsWith('--duration-source=')&&durationSourcePath===undefined)durationSourcePath=flag.slice('--duration-source='.length);
 else if(flag.startsWith('--worker-stems=')&&stemsDirectory===undefined)stemsDirectory=flag.slice('--worker-stems='.length);
 else if(flag.startsWith('--resume-audit=')&&resumeAuditPath===undefined)resumeAuditPath=flag.slice('--resume-audit='.length);
 else if(flag.startsWith('--post-stems=')&&postStemsDirectory===undefined)postStemsDirectory=flag.slice('--post-stems='.length);
 else if(flag.startsWith('--archive-repeat-model=')&&archiveRepeatModelPath===undefined)archiveRepeatModelPath=flag.slice('--archive-repeat-model='.length);
 else if(flag.startsWith('--rattle-stems=')&&rattleStemsDirectory===undefined)rattleStemsDirectory=flag.slice('--rattle-stems='.length);
 else if(flag.startsWith('--tail-stems=')&&tailStemsDirectory===undefined)tailStemsDirectory=flag.slice('--tail-stems='.length);
 else if(flag.startsWith('--prepared-source=')&&preparedSourcePath===undefined)preparedSourcePath=flag.slice('--prepared-source='.length);
 else if(flag.startsWith('--archive-source=')&&archiveSourcePath===undefined)archiveSourcePath=flag.slice('--archive-source='.length);
 else throw new Error('Unknown or duplicate stem export option');
 if(stemsDirectory===''||postStemsDirectory===''||resumeAuditPath===''||archiveRepeatModelPath===''||rattleStemsDirectory===''||tailStemsDirectory===''||preparedSourcePath==='')throw new Error('Explicit nonempty paths required');
}
if(!capture||!output||!['--pow-candidate','--native-double-pow'].includes(option)||extra.length>28)throw new Error('Usage: capture.json report.json --pow-candidate|--native-double-pow [--worker-stems=new-directory] [--post-stems=new-directory] [--rattle-stems=new-directory] [--tail-stems=new-directory] [--terminal-artifact=new-private-directory] [--auxiliary-source=complete-private-mid-capture] [--resume-audit=owned-resumes.jsonl] [--archive-repeat-model=source.json] [--computed-release-model] [--computed-key-release] [--computed-dispatch] [--poison-dispatch-target] [--computed-modal-clock] [--poison-modal-clock-target] [--computed-release-waveform] [--poison-release-wave-target] [--computed-extra-gain] [--poison-extra-gain-target] [--computed-damping-profile] [--poison-damping-profile-target] [--computed-header-ratios] [--poison-header-ratio-target] [--computed-terminal-slopes] [--computed-onset-initialization] [--pitch-source=private-archive-inputs.json] [--damping-source=private-damping-inputs.json] [--duration-source=private-duration-inputs.json] [--prepared-source=verified-report.json|--archive-source=current-private-inputs.json]');
const nativePowMode=option==='--native-double-pow';
if(computedReleaseWaveform&&(!archiveSourcePath||!auxiliarySourceDirectory)||poisonReleaseWaveTarget&&!computedReleaseWaveform)throw Error('Computed release waveform requires current archive and auxiliary source');
if(computedAuxiliaryWaveforms&&!computedReleaseWaveform||(poisonGeneratedWaveTarget||poisonGeneratedSelectionTarget)&&!computedAuxiliaryWaveforms)throw Error('Generated auxiliary bank requires archive release waveform calculation');
if(computedExtraGain&&!archiveSourcePath||poisonExtraGainTarget&&!computedExtraGain)throw Error('Own extra gain requires current archive');
if(computedDampingProfile&&(!computedKeyRelease||!archiveSourcePath)||poisonDampingProfileTarget&&!computedDampingProfile)throw Error('Own damping profile requires archive and key release');
if(computedHeaderRatios&&!archiveSourcePath||poisonHeaderRatioTarget&&!computedHeaderRatios)throw Error('Header ratios require current archive source');
if(poisonModalClockTarget&&!computedModalClock)throw Error('Modal clock negative requires own clock');
if(computedModalClock&&(!computedReleaseModel||!archiveSourcePath))throw Error('Own modal clock requires current archive source and computed release model');
if(poisonDispatchTarget&&!computedDispatch)throw Error('Dispatch negative requires own dispatch');
if(computedDispatch&&(!computedKeyRelease||!computedReleaseModel||!pitchSourcePath||!dampingSourcePath))throw Error('Own dispatch requires own key, release, archive pitch and damping');
if(pitchSourcePath===''||dampingSourcePath==='')throw new Error('Explicit control source required');
const dampingSourceBytes=dampingSourcePath?fs.readFileSync(dampingSourcePath):undefined;
const dampingSource=dampingSourceBytes?JSON.parse(dampingSourceBytes):undefined;
const dampingSourceSha256=dampingSourceBytes?crypto.createHash('sha256').update(dampingSourceBytes).digest('hex'):undefined;
if(dampingSource&&(dampingSource.schema!=='pianoteq-archive-damping-inputs-v1'||dampingSource.note!==69||dampingSource.positionRuntime!=='initialized-primary-no-overrides'))throw new Error('Explicit archive damping source and position branch required');
if(computedReleaseModel&&(!dampingSource||!archiveModalDampingControls(dampingSource).polynomialTail))throw new Error('Computed release model requires archive polynomial tail');
if(durationSourcePath===''||(durationSourcePath&&!computedReleaseModel))throw new Error('Duration source requires computed release model and explicit path');
const durationSourceBytes=durationSourcePath?fs.readFileSync(durationSourcePath):undefined;
const durationSource=durationSourceBytes?bindDurationSource(durationSourceBytes):undefined;
const durationSourceSha256=durationSourceBytes?crypto.createHash('sha256').update(durationSourceBytes).digest('hex'):undefined;
if(durationSource&&(durationSource.presetSha256!==dampingSource.presetSha256||durationSource.resourceSha256!==dampingSource.sources.resourceSha256||durationSource.bankMd5!==dampingSource.sources.bankMd5||durationSource.bank!==dampingSource.sources.bank||durationSource.modelIdentity!==dampingSource.modelIdentity))throw new Error('Duration and damping must use the same current preset/resource/model');
const durationTuning=durationSource?constructArchiveDurationTuning(durationSource):undefined;
const pitchSourceBytes=pitchSourcePath?fs.readFileSync(pitchSourcePath):undefined;
const pitchSource=pitchSourceBytes?JSON.parse(pitchSourceBytes):undefined;
const pitchSourceSha256=pitchSourceBytes?crypto.createHash('sha256').update(pitchSourceBytes).digest('hex'):undefined;
if(pitchSource){
 const legacy=pitchSource.schema==='pianoteq-archive-voice-pitch-inputs-v1'&&pitchSource.velocityProducerControlsExplicit===true&&pitchSource.velocityControls!==undefined&&pitchSource.velocityRuntime===undefined;
 const archive=pitchSource.schema==='pianoteq-archive-voice-pitch-inputs-v2'&&pitchSource.velocityProducerControlsFromArchive===true&&pitchSource.velocityControls===undefined&&pitchSource.velocityRuntime!==undefined;
 if((!legacy&&!archive)||pitchSource.note!==69||pitchSource.zeroCentsRuntimeBranchExplicit!==true)throw new Error('Explicit archive pitch source and runtime boundary required');
 if(durationSource&&(durationSource.presetSha256!==pitchSource.presetSha256||durationSource.resourceSha256!==pitchSource.sources?.resourceSha256||durationSource.modelIdentity!==pitchSource.modelIdentity))throw new Error('Duration and pitch must use the same current preset/resource/model');
}
let captureBytes=fs.readFileSync(capture);
const captureSha256=crypto.createHash('sha256').update(captureBytes).digest('hex');
const d=JSON.parse(captureBytes);captureBytes=undefined;
if(archiveSourcePath===''||(archiveSourcePath&&preparedSourcePath))throw new Error('Choose a new archive source or a historical prepared report');
const preparedSources=archiveSourcePath?bindArchiveExcitation(fs.readFileSync(archiveSourcePath),captureSha256,{computedHeaderRatios,computedDampingProfile,computedExtraGain}):preparedSourcePath?bindPreparedSources(fs.readFileSync(preparedSourcePath),captureSha256):undefined;
const ownDampingProfile=computedDampingProfile?preparedSources.modalDampingProfile:null;
const ownHeaderRatios=computedHeaderRatios?preparedSources.fixedVoiceHeaderRatios:null;
const ownModalClock=computedModalClock?modalRenderConfiguration(preparedSources.renderConfiguration):null;
if(ownModalClock&&ownModalClock.samples!==64)throw Error('Complete source replay currently requires64-sample render blocks');
if(archiveSourcePath){
 const identity=preparedSources.archiveIdentity;
 if(!dampingSource||!pitchSource||!durationSource||[dampingSource,pitchSource,durationSource].some(s=>s.presetSha256!==identity.presetSha256||s.modelIdentity!==identity.modelIdentity)||dampingSource.sources.resourceSha256!==identity.resourceSha256||durationSource.resourceSha256!==identity.resourceSha256||durationSource.bank!==identity.bank||durationSource.bankMd5!==identity.bankMd5)throw new Error('Current archive excitation must match damping, pitch and duration sources');
}
if(computedTerminalSlopes&&d.voiceTailEnvelopes!==true)throw new Error('Computed terminal slopes require same-run tail coverage');
if(rattleStemsDirectory&&d.voiceRattleAudio!==true)throw new Error('Rattle export requires same-run Rattle capture');
let archiveRepeatModel,archiveRepeatModelSource;
if(archiveRepeatModelPath){
 if(d.earlyConsumer!==true)throw new Error('Archive envelope source requires consumer coverage from zero');
 const bytes=fs.readFileSync(archiveRepeatModelPath);archiveRepeatModel=JSON.parse(bytes);
 if(archiveRepeatModel.schema!==1||archiveRepeatModel.presetSha256!==crypto.createHash('sha256').update(fs.readFileSync(archiveRepeatModel.presetPath)).digest('hex'))throw new Error('Archive model preset identity hash mismatch');
 archiveRepeatModelSource={path:archiveRepeatModelPath,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),modelIdentity:archiveRepeatModel.modelIdentity,presetSha256:archiveRepeatModel.presetSha256,runtimeModeSupplied:archiveRepeatModel.runtimeMode};
}
const consumerInjection=d.consumerInjection===true,sourceCommits=d.sourceCommits===true;
const commitSlotCoverage=sourceCommits?validateCommitSlots(d,resumeAuditPath?fs.readFileSync(resumeAuditPath,'utf8').trim().split('\n').map(line=>JSON.parse(line)):undefined):undefined;
let sourceCommitCount=0,modalCommitCount=0,sourceSkipCount=0,lateGlobalDifferences=0,sourcePending,sourcePhase,sourceConsumerAge;
const rattleAudioControls=new Map();
const consumerDelay=d.consumerDelay===true,consumerSources=new Map(),consumerVoices=new Map(),consumerCompared=new Map(),consumerOutputs=[];let consumerPreBlocks=0,consumerComparedBlocks=0,consumerCalculatedBlocks=0;
const workerOutputs=d.workerOutputs===true,dispatchAgesByVoice=new Map(),pendingRefreshByVoice=new Map(),transportTailsByVoice=new Map();let outputSamples=0,postStateBlocks=0,emptyVoiceBypassBlocks=0;
const dispatchControls=d.dispatchControls===true,dispatchAges=[],skippedRefreshAges=[];let pendingRefreshAge;
const windowBlocks=d.windowBlocks??8;if(!Number.isInteger(windowBlocks)||windowBlocks<1||windowBlocks>512)throw new Error('Supported explicit window length required');const windowEnd=64*windowBlocks;const expectedBlocks=workerOutputs?d.envelopeBlocks:windowBlocks;if(workerOutputs&&!dispatchControls)throw new Error('Worker output mode requires dispatch controls');
if(computedDampingProfile&&!workerOutputs)throw Error('Own damping shape requires full owned modal energy');
if(computedModalClock&&!workerOutputs)throw Error('Own modal clock requires complete worker coverage');
if(computedDispatch&&(!workerOutputs||!dispatchControls))throw Error('Own dispatch requires complete worker coverage');
if(consumerDelay&&!sourceCommits&&(!workerOutputs||d.fixedSites!==false||d.transitions?.length!==(consumerInjection?2:1)||d.transitions[0].afterInitializations!==5||d.transitions[0].weightsSeen!==10||d.transitions[0].activeSites!==6||d.transitions[0].consumerAddress!=='0x100460908'))throw new Error('Exact six-site consumer transition required');
if(consumerInjection&&!sourceCommits&&(d.injectionEntryObserved!==false||[['before','injectionMixed','0x1000fbe50']].some(([removedStage,addedStage,address],i)=>{const t=d.transitions[i+1];return t.removedStage!==removedStage||t.addedStage!==addedStage||t.address!==address||t.afterInitializations!==5||t.weightsSeen!==10||t.activeSites!==6;})))throw new Error('Exact six-site injection transition required');
if(d.schema!==1||(!consumerDelay&&d.fixedSites!==true)||d.siteCount!==6||!d.complete||d.pending||d.activeSites!==0||d.errors.length||d.starts!==5||d.spectrumCount!==10||d.finalCount!==5||(!dispatchControls&&d.refreshCount!==windowBlocks)||d.renderCount!==expectedBlocks||!d.copyCount||d.initializations!==0||!d.envelopeBlocks||d.envelopePending||!d.coefficientCount)throw new Error('Complete dynamic Rattle capture required');
const f=Math.fround,view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite x/control');view.setFloat32(0,x);return view.getUint32(0);};
const owners=new Map(),voices=new Map(),pending=new Map(),epochs=new Set(),failures=[],byStage={},mismatchesByName={};const modes=new Map();let spectrumCalls=0,finalCalls=0;const histories=new Map(),mathCalls=[];const math={exp2f:x=>{const y=nativeScalarExp2f(x);mathCalls.push({function:'exp2f',input:x,output:y});return y;},log10f:x=>{const y=nativeScalarLog10f(x);mathCalls.push({function:'log10f',input:x,output:y});return y;}};const powCalls=[];const postMath={pow:(x,y)=>{const output=nativePowMode?nativeDoublePow(x,y):Math.pow(x,y);powCalls.push({input:x,exponent:y,output});return output;}};let historyUpdates=0,randomDraws=0,phaseRandomDraws=0,modeSeedBridges=0;const sourceModels=new Map(),copied=new Map(),predictions=new Map(),producerChecks=new Set();let copies=0,oldReleasesComputed=0;const runtimes=new Map(),envelopes=new Map(),envelopePending=new Map(),envelopeCompleted=new Map(),coeffState=new Map();let blocks=0,duplicates=0;let checks=0,mismatches=0,starts=0,updates=0,coefficients=0,active=0,xChanges=0;
let comparisonContext;
function check(name,p,a){checks++;if(bits(p)!==bits(a)){mismatches++;mismatchesByName[name]=(mismatchesByName[name]??0)+1;if(failures.length<100)failures.push({name,predicted:p,actual:a,predictedBits:bits(p),actualBits:bits(a),context:comparisonContext});}}
function checkDouble(name,p,a){checks++;doubleChecks++;if(!Number.isFinite(p)||!Number.isFinite(a))throw new Error('Nonfinite double control/state');if(!Object.is(p,a)){mismatches++;mismatchesByName[name]=(mismatchesByName[name]??0)+1;if(failures.length<100)failures.push({name,predicted:p,actual:a});}}
function compareOnset(own,target){
 if(!target||['remaining','settle','delay','square','filtered'].some(k=>own[k]!==target[k]))throw new Error('Onset counters or branch state differs');
 for(const k of ['sine','cosine'])checkDouble('onset:'+k,own[k],target[k]);
 own.history.forEach((x,i)=>check('onset:history',x,target.history[i]));
}
function voice(r){const s=voices.get(r.epoch);if(!s||s.voice!==r.voice||owners.get(r.voice)!==r.epoch)throw new Error('Unbound voice epoch');if(r.modal&&BigInt(r.modal)!==BigInt(r.voice)+0x168n)throw new Error('Invalid modal owner');return s;}
function consumerConfig(controls){
 if(!controls||controls.spread!==1||typeof controls.mute!=='boolean'||!Number.isInteger(controls.bleedFlag)||!Number.isFinite(controls.bleedGain)||controls.bleedFlag===1&&controls.bleedGain>1e-8)throw new Error('Consumer spread/redistribution branch not yet verified');
}
function compareDelayStates(label,own,targets){
 if(own.length!==targets?.length)throw new Error('Complete consumer delay targets required');
 for(let g=0;g<own.length;g++){
  const state=own[g],target=targets[g];
  for(const key of ['length','elapsed','remaining'])if(state[key]!==target[key])throw new Error(`Consumer delay ${key} differs`);
  for(const key of ['writeGain','dryGain','target','multiplier'])check(label+':'+key,state[key],target[key]);
  if(target.ring){if(target.ring.length!==state.ring.length)throw new Error('Complete ring target required');target.ring.forEach((x,i)=>{if(state.elapsed>=state.length||i<state.elapsed)check(label+':ring',state.ring[i],x);});}
 }
}
function consumerUntil(epoch,end){
 const own=consumerVoices.get(epoch);if(!own||end<own.age||end%64)throw new Error('Consumer source chronology required');
 while(own.age<end){
  const source=consumerSources.get(`${epoch}:${own.age}`);if(!source)throw new Error('Missing own worker block for consumer');
  const input=own.mute?source.map(()=>new Float32Array(64)):source;
  const output=input.map((group,i)=>renderVoiceDelay(group,own.states[i]));
  own.outputs.set(own.age,output);consumerOutputs.push({epoch,counter:own.age,channels:output.map(x=>Array.from(x))});own.age+=64;consumerCalculatedBlocks++;
 }
 return own;
}
for(const [recordIndex,r] of d.records.entries()){
 comparisonContext={stage:r.stage,epoch:r.epoch,age:r.target?.sample_counter??r.counter};
 byStage[r.stage]=(byStage[r.stage]??0)+1;
 if(r.stage==='before'){
  if(r.ordinal!==starts||r.note!==69||r.epoch!==starts||!Number.isFinite(r.sourceX)||r.sourceX<0||r.sourceX>1)throw new Error('Invalid source chronology');
  if(dampingSource)dampingModels.set(r.epoch,archiveModalDampingControls({...dampingSource,note:r.note}));
  if(durationSource)durationModels.set(r.epoch,archiveReleaseDuration(durationSource,durationTuning,r.note));
  const inputs=structuredClone(r.inputs);
  if(preparedSources?.metadata.repeatHostRateFromExplicitRender){
   check('event-clock:host-rate',preparedSources.metadata.eventClockSampleRate,inputs.hostRate);
   inputs.hostRate=preparedSources.metadata.eventClockSampleRate;
  }
  if(preparedSources?.metadata.eventVelocityComputedFromMidiAndArchive){
   const velocity=preparedSources.beginVelocity(r);
   check('event-velocity:before',velocity,inputs.newVelocity);inputs.newVelocity=velocity;
  }
  let oldVoice=r.oldVoice,oldEpoch;
  if(computedKeyRelease){
   oldEpoch=preparedSources.previousMidiEpoch(r.epoch);
   if(oldEpoch!==null){
    const state=initialStates.get(oldEpoch);
    if(!workerOutputs||!state||!state.layout.some(row=>row[3]>0))throw new Error('Latest same-key predecessor must have own active modal state');
    oldVoice=voices.get(oldEpoch).voice;
   }else oldVoice='0x0';
   check('midi-old-voice:selection',oldEpoch??-1,r.oldVoice==='0x0'?-1:(owners.get(r.oldVoice)??-2));
  }
  if(computedKeyRelease?oldEpoch!==null:Boolean(inputs.old)){
   if(!inputs.old)throw new Error('Complete old-voice comparison target required');
   const c=copied.get(oldVoice);if(!c)throw new Error('Old voice release requires prior copy');
   if(preparedSources?.metadata.repeatDurationFromArchive){
    const duration=preparedSources.repeatDurationForEpoch(c.epoch);
    check('archive-repeat:duration',duration,inputs.old.duration);inputs.old.duration=duration;
   }
   if(preparedSources?.metadata.oldVoiceCounterComputedFromMidi){
    const count=preparedSources.oldVoiceSampleCount(r.epoch,c.epoch);
    check('event-clock:old-voice-count',count,inputs.old.count);inputs.old.count=count;
   }
   if(preparedSources?.metadata.eventVelocityComputedFromMidiAndArchive){
    const velocity=preparedSources.velocityForEpoch(c.epoch);
    check('event-velocity:old',velocity,inputs.old.velocity);inputs.old.velocity=velocity;
   }
   check('old-release',c.value,inputs.old.release);inputs.old.release=c.value;
   const h=histories.get(oldVoice);if(!h||h.length!==inputs.old.history.length)throw new Error('Old support history requires computed predecessor');h.forEach((v,i)=>check('old-history',v,inputs.old.history[i]));inputs.old.history=[...h];oldReleasesComputed++;
  }else if(!computedKeyRelease&&r.oldVoice!=='0x0')throw new Error('Invalid absent old voice');
  predictions.set(starts,repeatedStrikeControl(inputs));
  const x=preparedSources?.metadata.rattleSourceValuesFromMidi?preparedSources.initialRattleValue(r.epoch):f(r.sourceX);
  if(preparedSources?.metadata.rattleSourceValuesFromMidi)check('midi-rattle:initial',x,r.sourceX);
  if(computedKeyRelease){
   if(!sourceCommits||!preparedSources?.metadata.keyReleaseTimelineFromMidiAndArchive)throw new Error('Complete source-commit and MIDI key producer required');
   const key=preparedSources.keyStateAtConsumerAge(r.epoch,0);keyManagerStates.set(r.epoch,key);keyPublishedStates.set(r.epoch,key);
  }
  voices.set(starts,{voice:r.voice,owner:r.owner,initial:x,current:x,rattle:sourceCommits?new RattleControlState(x):undefined,newVelocity:f(inputs.newVelocity)});owners.set(r.voice,starts);const runtime=new DynamicReleaseVoice(x);runtimes.set(starts,runtime);envelopes.set(starts,runtime.envelope);coeffState.set(starts,{duration:0,rate:0,gain:0});starts++;
 }else if(r.stage==='rattleSource'){
  const s=voice(r);if(!sourceCommits||sourcePending!==undefined||r.owner!==s.owner)throw new Error('Bound frozen source event required');
  const sourceValue=preparedSources?.metadata.rattleSourceValuesFromMidi?preparedSources.rattleValueAtConsumerAge(r.epoch,r.consumerAge):r.frozenX;
  if(computedKeyRelease){
   const key=preparedSources.keyStateAtConsumerAge(r.epoch,r.consumerAge);
   if(key.frame<keyFrame)throw new Error('Monotonic manager key clock required');
   if(key.frame>keyFrame){
    keyFrame=key.frame;let previous=null;
    for(const epoch of [...voices.keys()].sort((a,b)=>b-a)){
     const current={velocity:preparedSources.velocityForEpoch(epoch),release:copied.get(voices.get(epoch).voice)?.value??0};
     if(releaseLinkSuppressed(previous,current,key.releaseFlag))keySuppressions++;
     else keyManagerStates.set(epoch,key);
     previous=current;
    }
   }
  }
  if(preparedSources?.metadata.rattleSourceValuesFromMidi)check('midi-rattle:frozen',sourceValue,r.frozenX);
  const old=s.rattle.current,x=s.rattle.updateSource(sourceValue);if(bits(old)!==bits(x))xChanges++;s.current=x;
  check('source:voice-x',x,r.currentX);sourcePending=r.epoch;sourceConsumerAge=r.consumerAge;sourcePhase='entry';sourceCommitCount++;
 }else if(r.stage==='rattleGate'){
  voice(r);if(!sourceCommits||sourcePending!==r.epoch||sourcePhase!==r.kind)throw new Error('Paired source dispatch gate required');
  const route=rattleDispatchRoute(r.kind,r.flag,r.multi);if(route!==r.route)throw new Error('Source dispatch route mismatch');sourcePhase=route;
 }else if(r.stage==='rattleSkip'){
  const s=voice(r);if(!sourceCommits||sourcePending!==r.epoch||sourcePhase!=='skip')throw new Error('Paired skipped source required');
  check('source:skipped-current',s.rattle.current,r.currentX);check('source:skipped-modal',s.rattle.modal,r.modalX);
  sourcePending=undefined;sourcePhase=undefined;sourceConsumerAge=undefined;sourceSkipCount++;
 }else if(r.stage==='rattleCommit'){
  const s=voice(r);if(!sourceCommits||sourcePending!==r.epoch||sourcePhase!=='commit')throw new Error('Paired modal commit required');
  let x;if(r.caller==='0x1007184b0')x=s.rattle.commitInitialization();
  else if(r.caller==='0x100460260'){
   x=s.rattle.commitRuntime();
   if(computedKeyRelease)keyPublishedStates.set(r.epoch,keyManagerStates.get(r.epoch));
   if(d.voiceRattleAudio){
    const key=`${r.epoch}:${sourceConsumerAge}`;
    if(!Number.isInteger(sourceConsumerAge)||sourceConsumerAge<0||sourceConsumerAge%64||rattleAudioControls.has(key))throw new Error('Unique Rattle consumer control commit required');
    rattleAudioControls.set(key,x);
   }
   sourcePending=undefined;sourcePhase=undefined;sourceConsumerAge=undefined;modalCommitCount++;
  }
  else throw new Error('Unknown modal commit caller');
  check('source:setter-input',x,r.argument);check('source:modal-store',x,r.modalX);runtimes.get(r.epoch).updateRattle(x);
 }else if(r.stage==='weights'){
  const v=voice(r);let input=r.input,supportHistory,ownHardnessControls,ownBlend;const p=predictions.get(r.epoch),seen=modes.get(r.epoch)??new Set();
  if(preparedSources){
   const source=preparedSources.consume(r,{repeat:p,velocityRuntime:pitchSource?.velocityRuntime});
   for(const name of ['frequency','decay','amplitude','phase'])source[name].forEach((x,i)=>check('prepared-source:'+name,x,r.input.source[name][i]));
   input={...r.input,source};
  }
  if(preparedSources?.metadata.blendControlsFromArchiveAndOwnVelocity){
   const blend=preparedSources.blendControls(r);
   ownBlend=blend;
   for(const key of ['blendFloor','inputBlend'])check('archive-blend:'+key,blend[key],r.input.controls[key]);
   blend.sharedBlendCoefficients.forEach((value,i)=>check('archive-blend:shared-'+i,value,r.input.controls.sharedBlendCoefficients[i]));
   input={...input,controls:{...input.controls,...blend}};
  }
  if(preparedSources?.metadata.hardnessControlsFromArchive){
   ownHardnessControls=preparedSources.hardnessControls(r);
   for(const [key,value] of Object.entries(ownHardnessControls))check('archive-hardness-control:'+key,value,r.input.controls[key]);
   input={...input,controls:{...input.controls,...ownHardnessControls}};
   supportHistory=preparedSources.supportHistoryControls(r);
   check('archive-history:randomScale',supportHistory.randomScale,r.randomScale);
   for(const [key,value] of Object.entries(supportHistory.historyControls))check('archive-history:'+key,value,r.historyControls[key]);
   for(const key of ['x','y']){
    if(supportHistory.historyCurve[key].length!==r.historyCurve[key].length)throw new Error('Complete own archive history curve required');
    supportHistory.historyCurve[key].forEach((value,i)=>check('archive-history:curve-'+key,value,r.historyCurve[key][i]));
   }
   for(const key of ['dimension','log_x','special_mode'])check('archive-history:curve-'+key,supportHistory.historyCurve[key],r.historyCurve[key]);
  }
  if(preparedSources?.metadata.eventVelocityComputedFromMidiAndArchive){
   const velocity=preparedSources.velocityForEpoch(r.epoch);
   check('event-velocity:weights',velocity,r.input.controls.velocity);
   check('event-velocity:post',velocity,r.postInputs.velocity);
   input={...input,controls:{...input.controls,velocity}};
  }
  if(preparedSources?.metadata.normalHardnessKnotsAndValuesComputedFromArchive){
   const curves=preparedSources.hardnessCurves(r);
   for(const family of ['primary','secondary'])for(const name of ['knots','values'])
    curves[family][name].forEach((value,i)=>check(`archive-hardness:${family}:${name}`,value,r.input.curves[family][name][i]));
   input={...input,curves};
  }
  if(!p||input.note!==69||![0,1].includes(input.mode)||seen.has(input.mode))throw new Error('Invalid hardness consumer');
  seen.add(input.mode);modes.set(r.epoch,seen);
  if(p.repeatFlag!==input.controls.repeatFlag)throw new Error('Hardness repeat flag mismatch');
  for(const k of ['age','attenuation'])check('hardness-input:'+k,p[k],input.controls[k]);
  if(r.controls.repeatFlag!==p.repeatFlag)throw new Error('Spectrum repeat flag mismatch');
  const extraControls={...r.extraControls},spectrumControls={...r.controls};
  let append=r.append;
  if(preparedSources?.metadata.spectrumBaseControlsFromArchive){
   const own=preparedSources.spectrumControls(r);
   for(const [key,value] of Object.entries(own)){
    if(Array.isArray(value))value.forEach((v,i)=>check('archive-spectrum:'+key+':'+i,v,r.controls[key][i]));
    else check('archive-spectrum:'+key,value,r.controls[key]);
    spectrumControls[key]=value;
   }
   check('archive-append:scale',own.scale,r.append.controls.scale);
   append={...r.append,controls:{...r.append.controls,scale:own.scale}};
  }
  if(ownBlend){
   for(const [key,value] of Object.entries({floor:ownBlend.blendFloor,blend:ownBlend.inputBlend})){check('archive-extra:'+key,value,r.extraControls[key]);extraControls[key]=value;}
   const referenceBlend=Math.max(ownBlend.blendFloor,ownBlend.inputBlend);check('archive-spectrum:referenceBlend',referenceBlend,r.controls.referenceBlend);spectrumControls.referenceBlend=referenceBlend;
  }
  if(ownHardnessControls){check('archive-extra:direction',ownHardnessControls.direction,r.extraControls.direction);extraControls.direction=ownHardnessControls.direction;}
  const extraTables={...r.extraTables};
  if(preparedSources?.metadata.floorAndBlendSpectrumTablesFromArchive){
   for(const [key,values] of Object.entries(preparedSources.extraTables(r))){
    if(values.length!==r.extraTables[key].length)throw new Error('Complete own spectrum extra table required');
    values.forEach((v,i)=>check('archive-extra-table:'+key+':'+i,v,r.extraTables[key][i]));
    extraTables[key]=values;
   }
  }
  let baseTables,coordinates=r.coordinates;
  if(preparedSources?.metadata.baseSpectrumTablesFromArchiveAndOwnInitialSource){
   baseTables=preparedSources.baseTables(r);coordinates=baseTables.coordinates;
   if(coordinates.length!==r.coordinates.length)throw new Error('Complete own spectrum coordinates required');
   coordinates.forEach((v,i)=>check('archive-spectrum-coordinate:'+i,v,r.coordinates[i]));
  }
  const built=buildReleaseControlledSpectrum({...r,input,controls:spectrumControls,extraControls,extraTables,coordinates,
   ...(baseTables?{baseTables,baseTable:undefined}:{}),repeat:p});const c=built.controls;
  if(baseTables)built.baseTable.forEach((v,i)=>check('archive-base-table:'+i,v,r.baseTable[i]));
  for(const k of ['slope','baseScale'])check('spectrum-control:'+k,c[k],r.actual[k]);
  if(!Number.isInteger(r.count)||r.count<1||r.count>4096||r.actual.extraTable.length!==r.count||r.expWeights.length!==r.count)throw new Error('Incomplete spectrum targets');
  const extra=built.extraTable,log=built.logSpectrum;
  for(let i=0;i<r.count;i++){check('extra-table',extra[i],r.actual.extraTable[i]);check('exp-weight:weights',built.expWeights[i],r.expWeights[i]);}
  if(pending.has(r.thread))throw new Error('Overlapping spectral weights');
  if(r.append.controls.repeatFlag!==p.repeatFlag)throw new Error('Append repeat flag differs');
  check('append-input:attenuation',p.attenuation,r.append.controls.attenuation);
  let history=r.history;
  if(input.mode===0){if(p.history.length!==history.length)throw new Error('Inherited support history shape differs');p.history.forEach((v,i)=>check('support-history-input',v,history[i]));history=[...p.history];}
  let invocation=pending.get(r.epoch);
  if(!invocation){invocation={voice:r.voice,thread:r.thread,modes:new Map()};pending.set(r.epoch,invocation);}
  if(invocation.voice!==r.voice||invocation.thread!==r.thread||invocation.modes.has(input.mode))throw new Error('Invalid mode pairing');
  let seed=r.randomState;
  if(input.mode===0&&preparedSources?.metadata.primaryInitialRandomStateIndependentlyProduced){
   seed=preparedSources.primaryRandomState(r);
   if(!Array.isArray(r.randomState)||r.randomState.length!==4)throw new Error('Complete RNG comparison target required');
   seed.forEach((value,i)=>{checks++;randomWordChecks++;if(value!==r.randomState[i]){mismatches++;mismatchesByName['prepared-primary-random-state']=(mismatchesByName['prepared-primary-random-state']??0)+1;if(failures.length<100)failures.push({name:'prepared-primary-random-state',epoch:r.epoch,index:i,predicted:value,actual:r.randomState[i]});}});
  }
  if(input.mode===1){
   const first=invocation.modes.get(0);if(!first||!seed||first.supported.randomState.some((v,i)=>v!==seed[i]))throw new Error('Uncomputed primary-to-secondary random bridge');
   seed=[...first.supported.randomState];modeSeedBridges++;
  }
  const supported=buildReleaseControlledSupport({...r,input,append,coordinates,baseTable:built.baseTable,extraControls,randomState:seed,repeat:p,spectrum:built,history,secondFamilyEnabled:r.append.secondIndices.length>0,...(supportHistory?{randomScale:supportHistory.randomScale,historyCurve:supportHistory.historyCurve,historyControls:supportHistory.historyControls}:{})},math);
  for(const k of ['indices','logAmplitudes','secondIndices','secondLogAmplitudes']){
   if(supported[k].length!==r.append[k].length)throw new Error('Support vector shape differs: '+JSON.stringify({epoch:r.epoch,mode:input.mode,vector:k,predictedLength:supported[k].length,actualLength:r.append[k].length,checks,mismatches,comparedOutputBlocks,outputSamples,mismatchesByName}));
   supported[k].forEach((v,i)=>{if(k.includes('Indices')||k==='indices'){if(v!==r.append[k][i])throw new Error('Support index differs');}else check('support:'+k,v,r.append[k][i]);});
  }
  historyUpdates+=supported.historyUpdates;randomDraws+=supported.randomDraws;
  invocation.modes.set(input.mode,{supported,postInputs:r.postInputs,mergeControls:r.mergeControls,lateRandomInputs:r.lateRandomInputs,selectionSource:r.selectionSource,onsetInputs:r.onsetInputs});spectrumCalls++;
  if(computedReleaseModel&&input.mode===1){
   const first=invocation.modes.get(0),second=invocation.modes.get(1);
   invocation.computedMerged=mergeReleaseExcitation({primary:first.supported,secondary:second.supported,postInputs:{...first.postInputs,velocity:v.newVelocity},controls:first.mergeControls,randomState:second.supported.randomState},postMath);
  }
 }else if(r.stage==='copy'){
  voice(r);if([...envelopePending.values()].some(p=>p.epoch===r.epoch))throw new Error('Copy during unfinished envelope');
  if(r.render){
   if(workerOutputs)throw new Error('Worker output targets must come from worker');
   if(r.epoch!==0||r.counter!==64*comparedOutputBlocks||r.render.samples!==64||r.counter>=windowEnd)throw new Error('Noncontiguous completed output window');
   const raw=modalOutputs.get(r.counter);if(!raw||raw.length!==r.render.channels.length)throw new Error('Missing computed complete modal block');
   if(!transportTails)transportTails=raw.map(()=>new Float32Array(Math.floor(r.render.delay/4)*4));
   const transported=transportModalBlock(raw,r.render.delay,transportTails);transportTails=transported.tails;
   const output=redistributeModalGroups(bypassPostModalProcessor(transported.output,r.render.processor),r.render.spread);
   for(let group=0;group<output.length;group++){if(r.render.channels[group].length!==64)throw new Error('Incomplete completed output channel');for(let i=0;i<64;i++)check('continuous:output',output[group][i],r.render.channels[group][i]);}
   continuousOutputs.push({counter:r.counter,channels:output.map(x=>Array.from(x))});comparedOutputBlocks++;outputSamples+=output.length*64;
  }
  if(consumerDelay){
   const pre=r.consumerPre;if(!pre)throw new Error('Consumer pre-state required');consumerConfig(pre.controls);
   let own=consumerVoices.get(r.epoch);
   if(!own){
    if(r.counter!==0||pre.delays.length!==3||pre.delays.some(state=>state.elapsed!==0||state.ring?.length!==state.length))throw new Error('Unwritten initial consumer delay state required');
    own={age:0,mute:pre.controls.mute,states:pre.delays.map(state=>({...state,ring:new Float32Array(state.length)})),outputs:new Map()};consumerVoices.set(r.epoch,own);
   }
   if(own.mute!==pre.controls.mute)throw new Error('Consumer mute transition not yet verified');
   consumerUntil(r.epoch,r.counter);compareDelayStates('consumer-pre',own.states,pre.delays);consumerPreBlocks++;
  }else if(r.consumerPre)throw new Error('Unexpected consumer pre-state');
  const value=runtimes.get(r.epoch).copyRelease();check('copy:modal',value,r.modalPosition);check('copy:voice',value,r.release);copied.set(r.voice,{value,epoch:r.epoch,counter:r.counter});copies++;
  if(!producerChecks.has(r.epoch)){
   const p=predictions.get(r.epoch);if(p.repeatFlag!==r.producerActual.repeatFlag)throw new Error('Repeat flag mismatch');
   for(const k of ['age','oldVelocity','attenuation'])check('repeat:'+k,p[k],r.producerActual[k]);
   if(p.history.length!==r.producerActual.history.length)throw new Error('Inherited history shape mismatch');
   p.history.forEach((v,i)=>check('repeat:history',v,r.producerActual.history[i]));producerChecks.add(r.epoch);
  }
 }else if(r.stage==='final'){
  if(initialStates.has(r.epoch))throw new Error('Duplicate final initialization');
   const v=voice(r),p=pending.get(r.epoch);
  if(!p||p.voice!==r.voice||p.modes.size!==2)throw new Error('Unpaired merged excitation');
  const first=p.modes.get(0),second=p.modes.get(1);
  for(const k of Object.keys(first.mergeControls)){check('merge-control:secondary:'+k,first.mergeControls[k],second.mergeControls[k]);}
  check('post-input:velocity',v.newVelocity,first.postInputs.velocity);
  const built=p.computedMerged??mergeReleaseExcitation({primary:first.supported,secondary:second.supported,
   postInputs:{...first.postInputs,velocity:v.newVelocity},controls:first.mergeControls,randomState:second.supported.randomState},postMath);
  check('post:feedbackGain',built.post.feedbackGain,r.feedbackGain);check('post:feedbackDecay',built.post.feedbackDecay,r.feedbackDecay);
  if(first.supported.history.length!==r.history.length)throw new Error('Final history shape differs');first.supported.history.forEach((value,i)=>check('support-history-final',value,r.history[i]));
  let mappedRandomState=built.randomState;
  if(!first.lateRandomInputs)throw new Error('Initialization random sources required');
  if(first.lateRandomInputs){
   if(JSON.stringify(first.lateRandomInputs)!==JSON.stringify(second.lateRandomInputs))throw new Error('Initialization random source snapshots differ');
   const late=advanceVoiceInitializationRandom({inputs:first.lateRandomInputs,randomState:built.randomState});
   mappedRandomState=late.randomState;initializationRandom.push({epoch:r.epoch,...late});
  }
  if(!r.randomState||r.randomState.length!==mappedRandomState.length)throw new Error('Missing initial random state');
  // Keep a late RNG mismatch fatal to the overall report, while retaining all
  // array comparisons. Never replace our phase seed with this native target.
  mappedRandomState.forEach((value,i)=>{checks++;randomWordChecks++;if(value!==r.randomState[i]){mismatches++;mismatchesByName['initial-random-state']=(mismatchesByName['initial-random-state']??0)+1;if(failures.length<100)failures.push({name:'initial-random-state',epoch:r.epoch,index:i,predicted:value,actual:r.randomState[i]});}});
  const [columns,rows,specialA,specialB,referenceRow,lower,upper]=built.header;
  if(specialA||specialB||rows*columns!==built.source.frequency.length)throw new Error('Unsupported mapped source');
  if(computedTerminalSlopes){
   if(terminalSlopeModels.has(r.epoch)||built.source.decay.length!==columns*rows)throw new Error('One complete computed decay source per voice required');
   const decayRow=rows===0?[]:Array.from(built.source.decay.slice(referenceRow*columns,(referenceRow+1)*columns));
   const slopes=terminalSlopesFromDecayRow({columns,rows,selectedRow:referenceRow,decayRow});
   terminalSlopeModels.set(r.epoch,{voice:r.voice,sourceRecordIndex:recordIndex,slopes});
  }

  if(!first.selectionSource||JSON.stringify(first.selectionSource)!==JSON.stringify(second.selectionSource))throw new Error('Missing or differing early selection sources');
  for(const key of Object.keys(first.selectionSource))check('selection-source:'+key,first.selectionSource[key],r.selectionControls[key]);
  const selection=selectVoiceModes({...r.selectionControls,...first.selectionSource,source:built.source,columns,splitRow:lower});
  if(JSON.stringify(selection.layout)!==JSON.stringify(r.target.groups))throw new Error('Computed selection layout differs');
  const target=r.target,c=target.controls,owned=coeffState.get(r.epoch);
  const extraGain=computedExtraGain?initializeZeroExtraDamping(preparedSources.zeroExtraDamping,v.newVelocity).extraGain:c['0x7e0'];
  if(computedExtraGain){extraGainSources.set(r.epoch,initializeZeroExtraDamping(preparedSources.zeroExtraDamping,v.newVelocity));check('extra-gain:zero-envelope',extraGain,c['0x7e0']);}
  const dampingShape=ownDampingProfile?modalDampingShape(ownDampingProfile,{velocity:v.newVelocity,energy:1,releaseFlag:keyPublishedStates.get(r.epoch).releaseFlag}):null;
  if(dampingShape){dampingShapeCounts[dampingShape.releaseShape===1?'normal':'modified']++;check('damping-profile:shape',dampingShape.releaseShape,c['0x7ec']);check('damping-profile:low',ownDampingProfile.releaseLow,c['0x7f0']);check('damping-profile:high',ownDampingProfile.releaseHigh,c['0x7f4']);}
  if(computedDispatch&&(extraGain!==0||target.block_factor_V810!==1||(dampingShape?.releaseShape??c['0x7ec'])!==1&&owned.gain===0))throw Error('Own dispatch unsupported initial profile');
  if(!owned||target.input_mode!==0||target.layout_flag!==0||target.energy_layout!==2||target.initial_flag!==1||target.sample_counter!==0)throw new Error('Initial no-input normal layout required');
  const mapped=mapVoiceSource({source:built.source,columns,referenceRow,zeroAdjustmentRows:[lower,upper],layout:selection.layout,indices:selection.indices});
  const expected=selection.layout.flatMap(([start,,,count])=>Array.from({length:Math.ceil((start+count)/4)-start/4},(_,i)=>start+4*i));
  const timestep=ownModalClock?.timestep??f(1/first.selectionSource.sampleRate);check('initial:timestep',timestep,c['0xc']);
  const pitchModel=pitchSource?archiveVoicePitchControls({...pitchSource,velocity:v.newVelocity,sourceReferenceDecay:mapped.referenceDecay,sampleRate:first.selectionSource.sampleRate}):undefined;
  const pitchTrajectory=pitchModel?new DynamicPitchTrajectory(pitchModel.controls):undefined;
  const pitchPrediction=pitchTrajectory?.next(64);
  if(pitchModel)pitchModels.push({epoch:r.epoch,...pitchModel});
  const controls={timestep,pitch:pitchPrediction?.pitch??c['0x780'],adjustmentRatio:ownHeaderRatios?.adjustmentRatio??c['0x784'],inputMode:0};
  if(pitchPrediction)check('initial:computed-pitch',pitchPrediction.pitch,c['0x780']);
  if(ownHeaderRatios){check('header-ratio:adjustment',ownHeaderRatios.adjustmentRatio,c['0x784']);check('header-ratio:decay',ownHeaderRatios.decayScale,c['0x7f8']);}
  const states=new Map();
  for(const lane of expected){
   const initial=initialModalGroup({...controls,frequency:mapped.frequency.slice(lane,lane+4),pitchAdjustment:mapped.J.slice(lane,lane+4),amplitude:mapped.amplitude.slice(lane,lane+4),phase:mapped.phase.slice(lane,lane+4)});
   for(let i=0;i<4;i++)states.set(lane+i,Object.fromEntries(['P','Q','energy','S','K','sinInverse'].map(name=>[name,initial[name][i]])));
   initialGroups++;
  }
  if(target.lanes.length!==states.size)throw new Error('Incomplete final initialized lanes');
  const targets=new Map(target.lanes.map(row=>[row.lane,row]));if(targets.size!==states.size)throw new Error('Duplicate final target lane');
  check('initial:release-rate',owned.rate,c['0x7e4']);check('initial:position-gain',owned.gain,c['0x7b0']);
  const referenceFrequency=built.source.frequency[referenceRow*columns];
  check('position-source:referenceFrequency',referenceFrequency,r.positionInputs.referenceFrequency);
  if(lower!==r.positionInputs.cutoffIndex)throw new Error('Position cutoff must come from computed source header');
  const damping=dampingModels.get(r.epoch);
  if(damping){check('initial:archive-position',damping.position,r.positionInputs.position);check('initial:archive-rolloff',damping.rolloff,r.positionInputs.rolloff);}
  const positionInputs=damping?{...r.positionInputs,position:damping.position,rolloff:damping.rolloff,...(damping.extraCurve?{extraCurve:damping.extraCurve}:{})}:r.positionInputs;
  const positionWeights=owned.gain===0&&extraGain===0?new Float32Array(mapped.frequency.length):modalPositionWeights({...positionInputs,referenceFrequency,cutoffIndex:lower,frequency:mapped.frequency,indexStorage:selection.indexStorage,layout:selection.layout});
  const groups=selection.layout.map(([start,,,count],group)=>Array.from({length:Math.ceil(count/4)*4},(_,i)=>{
   const lane=start+i,row=targets.get(lane),state=states.get(lane);
   if(!row||!state||row.group!==group||row.valid!==(i<count))throw new Error('Final target lane/group identity differs');
   return {modalDecay:mapped.decay[lane],energy:state.energy,cosine:state.K,weight:positionWeights[lane]};
  }));
  if(ownModalClock){check('modal-clock:block-length',ownModalClock.blockLength,target.block_length_V768);check('modal-clock:block-factor',ownModalClock.blockFactor,target.block_factor_V810);}
  const refreshed=refreshDampedModes(groups,{timestep:controls.timestep,pitch:controls.pitch,scale:ownHeaderRatios?.decayScale??c['0x7f8'],release:owned.rate,gain:owned.gain,extraGain,releaseShape:dampingShape?.releaseShape??c['0x7ec'],releaseLow:ownDampingProfile?.releaseLow??c['0x7f0'],releaseHigh:ownDampingProfile?.releaseHigh??c['0x7f4'],blockLength:ownModalClock?.blockLength??target.block_length_V768,blockFactor:ownModalClock?.blockFactor??target.block_factor_V810});
  check('initial:normalization',refreshed.normalization,c['0x7e8']);
  for(const [group,[start,,,count]] of selection.layout.entries())for(let i=0;i<groups[group].length;i++){
   const lane=start+i,row=targets.get(lane),state=states.get(lane),coeff=refreshed.groups[group][i];
   if(bits(positionWeights[lane])!==bits(row.position_weight))weightDiagnostics.push({epoch:r.epoch,lane,valid:row.valid,index:selection.indices[lane],frequency:mapped.frequency[lane],predicted:positionWeights[lane],actual:row.position_weight});
   check('initial:position-weight',positionWeights[lane],row.position_weight);
   state.Q=f(state.Q*coeff.radius);Object.assign(state,coeff,{frequency:mapped.frequency[lane],J:mapped.J[lane],modalDecay:mapped.decay[lane],weight:positionWeights[lane],sourceIndex:selection.indexStorage[lane]});
   check('mapped:frequency',mapped.frequency[lane],row.frequency);check('mapped:J',mapped.J[lane],row.J);check('mapped:decay',mapped.decay[lane],row.modal_decay);
   for(const name of ['P','Q','energy','S','K'])check('final:'+name,state[name],row[name]);
   check('final:sinInverse',state.sinInverse,row.sin_inverse);check('final:radius',state.radius,row.R);check('final:effectiveDecay',state.decay,row.effective_decay);check('final:A',state.A,row.A);check('final:B',state.B,row.B);
  }
  if(!first.onsetInputs||JSON.stringify(first.onsetInputs)!==JSON.stringify(second.onsetInputs))throw new Error('Paired onset source inputs required');
  const onsetParameters=modalOnsetDuration(first.onsetInputs,built.source,built.header,first.selectionSource.sampleRate);
  const initialization=computedOnsetInitialization?constructModalOnsetInitialization({duration:onsetParameters.duration,square:first.onsetInputs.square,sampleRate:first.selectionSource.sampleRate}):{step:target.onset.step,coefficients:target.onset.coefficients};
  if(computedOnsetInitialization){
   initialization.step.forEach((x,i)=>checkDouble('onset:initial-step',x,target.onset.step[i]));
   if(initialization.filterCoefficientsUsed)initialization.coefficients.forEach((x,i)=>check('onset:initial-filter',x,target.onset.coefficients[i]));
  }
  const onset=new ModalOnsetEnvelope({duration:onsetParameters.duration,square:first.onsetInputs.square,step:initialization.step,coefficients:initialization.coefficients});
  compareOnset(onset,target.onset);
  // 7c02e8 initializes P/Q and A/B throughout each padded group, beyond
  // the four-lane coefficient tail as well. These extra lanes are real input
  // to the eight-lane tail kernel, even when only four lanes remain.
  for(const [start,padded] of selection.layout)for(let lane=start;lane<padded;lane++)if(!states.has(lane))states.set(lane,{P:0,Q:0,A:0,B:0});
  initialStates.set(r.epoch,{energy:1,pitchTrajectory,pitchPrediction,positionWarmupBlocks:positionWeightWarmupBlocks(first.onsetInputs.noteIndex),positionWeightsReady:owned.gain!==0||extraGain!==0,positionWeightPosition:positionInputs.position,normalization:refreshed.normalization,layout:selection.layout,controls,states,renderAge:0,readyAge:0,coefficientAge:0,referenceFrequency,cutoffIndex:lower,onset,onsetParameters});
  initialSnapshots.push({epoch:r.epoch,layout:selection.layout.map(x=>[...x]),controls:{...controls},lanes:[...states].map(([lane,state])=>({lane,...state}))});
  histories.set(r.voice,[...first.supported.history]);phaseRandomDraws+=built.phaseRandomDraws;
  pending.delete(r.epoch);finalCalls++;
 }else if(r.stage==='refresh'){
  voice(r);const st=initialStates.get(r.epoch),t=r.target,c=t.controls,age=t.sample_counter;
  const extraGain=computedExtraGain?extraGainSources.get(r.epoch).extraGain:c['0x7e0'];
  if(computedExtraGain){let value=c['0x7e0'];if(poisonExtraGainTarget&&!extraGainTargetPoisoned){value=0.125;extraGainTargetPoisoned=true;}check('extra-gain:zero-envelope',extraGain,value);}
  const dampingShape=ownDampingProfile?modalDampingShape(ownDampingProfile,{velocity:voices.get(r.epoch).newVelocity,energy:st.energy,releaseFlag:keyPublishedStates.get(r.epoch).releaseFlag}):null;
  if(dampingShape){dampingShapeCounts[dampingShape.releaseShape===1?'normal':'modified']++;let shapeTarget=c['0x7ec'];if(poisonDampingProfileTarget&&!dampingProfileTargetPoisoned){shapeTarget=f(shapeTarget+0.125);dampingProfileTargetPoisoned=true;}check('damping-profile:shape',dampingShape.releaseShape,shapeTarget);check('damping-profile:low',ownDampingProfile.releaseLow,c['0x7f0']);check('damping-profile:high',ownDampingProfile.releaseHigh,c['0x7f4']);}
  if(computedDispatch&&(extraGain!==0||t.block_factor_V810!==1||(dampingShape?.releaseShape??c['0x7ec'])!==1&&coeffState.get(r.epoch).gain===0))throw Error('Own dispatch unsupported refresh profile '+JSON.stringify({epoch:r.epoch,age,extraGain,releaseShape:c['0x7ec'],factor:t.block_factor_V810}));
  if((!workerOutputs&&r.epoch!==0)||!st||age!==st.renderAge||(dispatchControls?age!==(workerOutputs?pendingRefreshByVoice.get(r.epoch):pendingRefreshAge):age!==64*(refreshes+1))||(!workerOutputs&&age>windowEnd)||t.initial_flag!==0||t.input_mode!==0||t.layout_flag!==0||t.energy_layout!==2)throw new Error('Noncontiguous complete refresh window required');
  compareOnset(st.onset,t.onset);
  if(workerOutputs){if(st.postPrunedAge!==age)throw new Error('Missing own completed-block pruning');}
  else{
  const pruned=updateModalEnergyAndPrune(st.states,st.layout,{threshold:t.prune_threshold,energyLayout:t.energy_layout,keepSlots:(t.keep_slots&1)!==0,freezeLayout:false});
  st.layout=pruned.layout;removals.push(...pruned.removed.map(row=>({age,...row})));
  }
  if(JSON.stringify(st.layout)!==JSON.stringify(t.groups))throw new Error('Computed continuous pruning layout differs: '+JSON.stringify({epoch:r.epoch,age,checks,mismatches,comparedOutputBlocks,outputSamples,mismatchesByName}));
  if(st.pitchTrajectory&&st.pitchPrediction.counter!==age)throw new Error('Missing own pitch update before refresh');
  const controls={timestep:st.controls.timestep,pitch:st.pitchPrediction?.pitch??c['0x780'],adjustmentRatio:ownHeaderRatios?.adjustmentRatio??c['0x784'],inputMode:0};
  if(ownHeaderRatios){let target=c['0x784'];if(poisonHeaderRatioTarget&&!headerRatioTargetPoisoned){target=f(target+0.125);headerRatioTargetPoisoned=true;}check('header-ratio:adjustment',ownHeaderRatios.adjustmentRatio,target);check('header-ratio:decay',ownHeaderRatios.decayScale,c['0x7f8']);}
  if(st.pitchTrajectory)check('refresh:computed-pitch',controls.pitch,c['0x780']);
  check('refresh:timestep',controls.timestep,c['0xc']);
  const changed=controls.pitch!==st.controls.pitch||controls.adjustmentRatio!==st.controls.adjustmentRatio;
  for(const [start,,,count] of st.layout)for(let lane=start;lane<Math.ceil((start+count)/4)*4;lane+=4){
   const rows=Array.from({length:4},(_,i)=>st.states.get(lane+i));
   const angles=modalAngleGroup({...controls,frequency:rows.map(x=>x.frequency),pitchAdjustment:rows.map(x=>x.J)});
   if(changed){
    const projected=projectModalHistory({P:rows.map(x=>x.P),Q:rows.map(x=>x.Q),oldRadius:rows.map(x=>x.radius),oldCosine:rows.map(x=>x.K),oldSinInverse:rows.map(x=>x.sinInverse),newSine:angles.S,newCosine:angles.K});
    rows.forEach((row,i)=>{row.P=projected[i];});
   }
   rows.forEach((row,i)=>{row.K=angles.K[i];row.S=angles.S[i];row.sinInverse=angles.sinInverse[i];});
  }
  const size=Math.max(...st.layout.map(([,padded])=>padded)),frequency=new Float32Array(size),indexStorage=new Float32Array(size);
  for(const [lane,row] of st.states){frequency[lane]=row.frequency??0;indexStorage[lane]=row.sourceIndex??0;}
  check('refresh:referenceFrequency',st.referenceFrequency,r.positionInputs.referenceFrequency);
  if(st.cutoffIndex!==r.positionInputs.cutoffIndex)throw new Error('Carried source cutoff differs');
  const owned=coeffState.get(r.epoch);check('refresh:release-rate',owned.rate,c['0x7e4']);check('refresh:position-gain',owned.gain,c['0x7b0']);
  const damping=dampingModels.get(r.epoch);
  if(damping){check('refresh:archive-position',damping.position,r.positionInputs.position);check('refresh:archive-rolloff',damping.rolloff,r.positionInputs.rolloff);}
  const positionInputs=damping?{...r.positionInputs,position:damping.position,rolloff:damping.rolloff,...(damping.extraCurve?{extraCurve:damping.extraCurve}:{})}:r.positionInputs;
  const positionWarmupDue=!st.positionWeightsReady&&age>=64*st.positionWarmupBlocks;
  const needsPositionWeights=!st.positionWeightsReady||st.positionWeightPosition!==positionInputs.position;
  const weights=!needsPositionWeights||owned.gain===0&&extraGain===0&&!positionWarmupDue?undefined:modalPositionWeights({...positionInputs,referenceFrequency:st.referenceFrequency,cutoffIndex:st.cutoffIndex,frequency,indexStorage,layout:st.layout});
  if(weights){st.positionWeightsReady=true;st.positionWeightPosition=positionInputs.position;}
  if(weights)for(const [start,,,count] of st.layout)for(let lane=start;lane<Math.ceil((start+count)/4)*4;lane++)st.states.get(lane).weight=weights[lane];
  const groups=st.layout.map(([start,,,count])=>Array.from({length:Math.ceil(count/4)*4},(_,i)=>{const row=st.states.get(start+i);return {modalDecay:row.modalDecay,energy:row.energy,cosine:row.K,weight:row.weight,frequency:row.frequency,active:i<count};}));
  if(ownModalClock){check('modal-clock:block-length',ownModalClock.blockLength,t.block_length_V768);check('modal-clock:block-factor',ownModalClock.blockFactor,t.block_factor_V810);}
  const damped=refreshDampedModes(groups,{timestep:controls.timestep,pitch:controls.pitch,scale:ownHeaderRatios?.decayScale??c['0x7f8'],release:owned.rate,gain:owned.gain,extraGain,releaseShape:dampingShape?.releaseShape??c['0x7ec'],releaseLow:ownDampingProfile?.releaseLow??c['0x7f0'],releaseHigh:ownDampingProfile?.releaseHigh??c['0x7f4'],blockLength:ownModalClock?.blockLength??t.block_length_V768,blockFactor:ownModalClock?.blockFactor??t.block_factor_V810});
  if(owned.gain!==0)st.normalization=damped.normalization;
  check('refresh:normalization',st.normalization,c['0x7e8']);
  let n=0;
  for(const [g,[start,,,count]] of st.layout.entries())for(let i=0;i<Math.ceil(count/4)*4;i++){
   const lane=start+i,row=st.states.get(lane),a=t.lanes[n++];if(!a||a.lane!==lane||a.group!==g)throw new Error('Incomplete refresh lane targets');
   Object.assign(row,damped.groups[g][i]);comparisonContext={...comparisonContext,lane};
   for(const name of ['P','Q','energy','S','K','A','B'])check('refresh:'+name,row[name],a[name]);
   for(const [name,target] of [['frequency','frequency'],['J','J'],['modalDecay','modal_decay'],['weight','position_weight'],['sinInverse','sin_inverse'],['radius','R'],['decay','effective_decay']])check('refresh:'+name,row[name],a[target]);
  }
  if(n!==t.lanes.length)throw new Error('Extra refresh targets');st.controls=controls;st.readyAge=age;st.coefficientAge=age;refreshes++;if(dispatchControls){if(workerOutputs)pendingRefreshByVoice.delete(r.epoch);else pendingRefreshAge=undefined;}
 }else if(r.stage==='coefficients'){
  const pitchState=initialStates.get(r.epoch);
  if(pitchState?.pitchTrajectory){
   pitchState.pitchPrediction=pitchState.pitchTrajectory.next(64);
   if(pitchState.pitchPrediction.counter!==r.counter)throw new Error(`Noncontiguous own pitch age: epoch=${r.epoch} predicted=${pitchState.pitchPrediction.counter} target=${r.counter}`);
   if(r.dispatch&&!r.dispatch.required&&pitchState.pitchPrediction.applied)throw new Error('Own pitch correction requires modal refresh');
  }
  const s=voice(r);if(r.owner!==s.owner||!Number.isFinite(r.sourceX)||r.sourceX<0||r.sourceX>1)throw new Error('Invalid global Rattle source');
  const x=sourceCommits?s.rattle.modal:f(r.sourceX);
  if(sourceCommits){if(bits(r.sourceX)!==bits(s.rattle.current))lateGlobalDifferences++;check('coefficient:voice-x',s.rattle.current,r.currentX);}
  else{if(bits(x)!==bits(s.current))xChanges++;s.current=x;check('coefficient:voice-x',x,r.currentX);}
  runtimes.get(r.epoch).updateRattle(x);check('coefficient:modal-x',x,r.modalX);
  if(!Number.isInteger(r.releaseFlag)||r.releaseFlag<0||r.releaseFlag>255)throw new Error('Invalid release flag');
  const key=computedKeyRelease?keyPublishedStates.get(r.epoch):{u:r.u,releaseFlag:r.releaseFlag};
  if(computedKeyRelease){check('midi-key:u',key.u,r.u);check('midi-key:release-flag',key.releaseFlag,r.releaseFlag);}
  const enabled=(key.releaseFlag&1)!==0||x>0;
  const damping=dampingModels.get(r.epoch);
  if(damping)for(const key of Object.keys(damping.release))check('coefficient:archive-'+key,damping.release[key],r.inputs[key]);
  let coefficientModel=damping?{...r.inputs,...damping.release}:r.inputs;
  if(computedReleaseModel){
   let own=releaseModels.get(r.epoch);
   if(!own){
    const prepared=pending.get(r.epoch),built=prepared?.computedMerged,first=prepared?.modes.get(0);
    if(r.counter!==0||!built||!damping?.polynomialTail||!first?.selectionSource)throw new Error('Own merged decay source required before first release coefficient');
    const [columns,rows,specialA,specialB,selectedDecayRow]=built.header;
    if(specialA||specialB||built.source.decay.length!==columns*rows)throw new Error('Complete own merged decay source required');
    const decayRow=rows?Array.from(built.source.decay.slice(selectedDecayRow*columns,(selectedDecayRow+1)*columns)):[];
    const duration=durationSource?durationModels.get(r.epoch).duration:r.inputs.polynomial[0];
    own=initializeReleaseModel({duration,polynomialTail:damping.polynomialTail,...damping.release,sampleRate:first.selectionSource.sampleRate,decayRows:rows,selectedDecayRow:decayRow});
    releaseModelSources.set(r.epoch,{columns,rows,selectedRow:selectedDecayRow,decayRow,minimumBeforeClamp:rows?Math.min(...decayRow):null,durationInputObserved:!durationSource});
    releaseModels.set(r.epoch,own);
   }
   own.polynomial.forEach((value,i)=>check('coefficient:own-polynomial-'+i,value,r.inputs.polynomial[i]));check('coefficient:own-rateScale',own.rateScale,r.inputs.rateScale);
   coefficientModel={...coefficientModel,polynomial:own.polynomial,rateScale:own.rateScale};
  }
  const v=runtimes.get(r.epoch).refresh({model:coefficientModel,u:key.u,releaseFlag:key.releaseFlag});
  if(enabled)active++;
  for(const k of ['duration','rate','gain'])check(k,v[k],r.actual[k]);coeffState.set(r.epoch,v);epochs.add(r.epoch);coefficients++;
  if(dispatchControls){
   if(!r.dispatch||typeof r.dispatch.required!=='boolean'||![0,1].includes(r.dispatch.flag)||r.dispatch.required!==(r.dispatch.flag===1)||r.dispatch.factor!==1||r.dispatch.phase!==0||![0,1].includes(r.dispatch.initial)||r.counter!==runtimes.get(r.epoch).envelope.samplesProcessed)throw new Error('Complete dispatch decision required');
   check('dispatch:committed-u',key.u,r.dispatch.committedU);
   let required=r.dispatch.required;
   if(computedDispatch){
    const st=initialStates.get(r.epoch);
    let policy=ownDispatchPolicies.get(r.epoch);if(!policy){policy=new ModalRefreshPolicy();ownDispatchPolicies.set(r.epoch,policy);}
    required=policy.next({counter:r.counter,logicalModeCount:st?st.layout.reduce((n,g)=>n+g[3],0):0,
     gain:v.gain,rate:v.rate,pitchApplied:st?.pitchPrediction?.applied??false,
     positionWarmupDue:!!st&&!st.positionWeightsReady&&r.counter>=64*st.positionWarmupBlocks}).required;
    let target=r.dispatch.required;if(poisonDispatchTarget&&!dispatchTargetPoisoned&&r.counter>0){target=!target;dispatchTargetPoisoned=true;}
    check('dispatch:owned-required',Number(required),Number(target));
   }
   if(workerOutputs){
    const age=r.counter,ages=dispatchAgesByVoice.get(r.epoch)??[];
    if(age!==ages.length*64||pendingRefreshByVoice.has(r.epoch))throw new Error('Missing all-voice dispatch or refresh');ages.push(age);dispatchAgesByVoice.set(r.epoch,ages);
    if(age===0){if(r.dispatch.initial!==1||!required)throw new Error('Initial all-voice dispatch required');}
    else if(required){if(r.dispatch.initial!==0||r.skippedState)throw new Error('Invalid all-voice refresh decision');pendingRefreshByVoice.set(r.epoch,age);}
    else{
     const st=initialStates.get(r.epoch),t=r.skippedState;
     if(!st||st.renderAge!==age||st.postPrunedAge!==age||!t||r.dispatch.initial!==0||JSON.stringify(st.layout)!==JSON.stringify(t.groups))throw new Error('Missing own pruned state at skipped refresh');
     let n=0;
     for(const [g,[start,,,count]] of st.layout.entries())for(let i=0;i<Math.ceil(count/4)*4;i++){
      const lane=start+i,row=st.states.get(lane),a=t.lanes[n++];if(!a||a.lane!==lane||a.group!==g)throw new Error('Incomplete all-voice skipped lanes');
      comparisonContext={...comparisonContext,lane};for(const key of ['P','Q','A','B','frequency','modalDecay','J','K','S','sinInverse','radius','energy','weight'])check('skipped:'+key,row[key],a[key]);
     }
     if(n!==t.lanes.length)throw new Error('Extra all-voice skipped lanes');st.readyAge=age;skippedRefreshAges.push({epoch:r.epoch,age});
    }
   }else if(r.epoch===0&&r.counter<=windowEnd){
    const age=r.counter;if(age!==dispatchAges.length*64||pendingRefreshAge!==undefined)throw new Error('Missing dispatch or required refresh');dispatchAges.push(age);
    if(age===0){if(r.dispatch.initial!==1||!required)throw new Error('Initial dispatch required');}
    else if(required){if(r.dispatch.initial!==0||r.skippedState)throw new Error('Invalid refresh dispatch');pendingRefreshAge=age;}
    else{
     const st=initialStates.get(0),t=r.skippedState;
     if(!st||age!==st.renderAge||!t||r.dispatch.initial!==0)throw new Error('Missing skipped-refresh state');
     const pruned=updateModalEnergyAndPrune(st.states,st.layout,{threshold:t.threshold,energyLayout:t.energyLayout,keepSlots:(t.keepSlots&1)!==0,freezeLayout:false});
     st.layout=pruned.layout;removals.push(...pruned.removed.map(row=>({age,...row})));
     if(JSON.stringify(st.layout)!==JSON.stringify(t.groups))throw new Error('Skipped-refresh pruning layout differs');
     let n=0;
     for(const [g,[start,,,count]] of st.layout.entries())for(let i=0;i<Math.ceil(count/4)*4;i++){
      const lane=start+i,row=st.states.get(lane),a=t.lanes[n++];if(!a||a.lane!==lane||a.group!==g)throw new Error('Incomplete skipped-refresh lanes');
      comparisonContext={...comparisonContext,lane};for(const key of ['P','Q','A','B','frequency','modalDecay','J','K','S','sinInverse','radius','energy','weight'])check('skipped:'+key,row[key],a[key]);
     }
     if(n!==t.lanes.length)throw new Error('Extra skipped-refresh lanes');st.readyAge=age;skippedRefreshAges.push(age);
    }
   }else if(r.skippedState)throw new Error('Unexpected skipped-refresh targets');
  }else if(r.dispatch||r.skippedState)throw new Error('Unexpected dispatch metadata');
 }else if(r.stage==='envelopeResult'){
  voice(r);const runtime=runtimes.get(r.epoch),env=runtime.envelope,c=coeffState.get(r.epoch);
  const samples=ownModalClock?.samples??r.samples;
  const baseDuration=ownModalClock?releaseModels.get(r.epoch).polynomial[0]:r.baseDuration;
  const timestep=ownModalClock?.timestep??r.timestep;
  if(ownModalClock){let targetSamples=r.samples;if(poisonModalClockTarget&&!modalClockTargetPoisoned&&env.samplesProcessed>0){targetSamples^=1;modalClockTargetPoisoned=true;}check('modal-clock:samples',samples,targetSamples);check('modal-clock:base-duration',baseDuration,r.baseDuration);check('modal-clock:timestep',timestep,r.timestep);}
  check('envelope:duration',c.duration,r.duration);
  if(((env.samplesProcessed+samples)>>>0)!==r.counter)throw new Error('Envelope counter discontinuity');
  if(workerOutputs||r.epoch===0&&r.counter<=windowEnd){
   const st=initialStates.get(r.epoch);if(!st||st.renderAge+samples!==r.counter||st.readyAge!==st.renderAge||samples!==64)throw new Error('Missing own initial state or refresh before render');
   tailTwelveGroups+=st.layout.filter(([,,,count])=>(Math.ceil(count/4)*4)%16===12).length;
   const output=renderModalVoiceBlock(st.states,st.layout,samples),onset=workerOutputs&&st.layout.every(([,,,count])=>count===0)?null:st.onset.process(samples);
   if(onset)for(const channel of output)for(let i=0;i<channel.length;i++)channel[i]=f(channel[i]*onset[i]);
   if(workerOutputs){
    const target=r.render,t=r.postState;if(!target||target.samples!==64||!t||target.channels.length!==output.length)throw new Error('Complete worker output and post-state targets required');
    const tails=transportTailsByVoice.get(r.epoch)??output.map(()=>new Float32Array(Math.floor(target.delay/4)*4));
    const empty=st.layout.every(([,,,count])=>count===0);if(empty)emptyVoiceBypassBlocks++;
    const transported=empty?{output,tails}:transportModalBlock(output,target.delay,tails);transportTailsByVoice.set(r.epoch,transported.tails);
    const completed=bypassPostModalProcessor(transported.output,target.processor);
    for(let group=0;group<completed.length;group++){if(target.channels[group].length!==64)throw new Error('Incomplete worker channel');for(let i=0;i<64;i++)check('continuous:output',completed[group][i],target.channels[group][i]);}
    if(consumerDelay)consumerSources.set(`${r.epoch}:${st.renderAge}`,completed.map(x=>Float32Array.from(x)));
    continuousOutputs.push({epoch:r.epoch,counter:st.renderAge,channels:completed.map(x=>Array.from(x))});comparedOutputBlocks++;outputSamples+=completed.length*64;
    const pruned=updateModalEnergyAndPrune(st.states,st.layout,{threshold:t.threshold,energyLayout:t.energyLayout,keepSlots:(t.keepSlots&1)!==0,freezeLayout:false});
    st.layout=pruned.layout;if(ownDampingProfile)st.energy=sumModalEnergy(st.states,st.layout);removals.push(...pruned.removed.map(row=>({epoch:r.epoch,age:r.counter,...row})));
    if(JSON.stringify(st.layout)!==JSON.stringify(t.groups))throw new Error('Worker post-block pruning layout differs: '+JSON.stringify({epoch:r.epoch,age:r.counter,checks,mismatches,comparedOutputBlocks,outputSamples,mismatchesByName}));
    let n=0;
    for(const [g,[start,,,count]] of st.layout.entries())for(let i=0;i<Math.ceil(count/4)*4;i++){
     const lane=start+i,row=st.states.get(lane),a=t.lanes[n++];if(!a||a.lane!==lane||a.group!==g)throw new Error('Incomplete post-block lane targets');comparisonContext={...comparisonContext,lane};
     for(const key of ['P','Q','energy'])check('post:'+key,row[key],a[key]);
    }
    if(n!==t.lanes.length)throw new Error('Extra post-block lanes');st.postPrunedAge=r.counter;postStateBlocks++;
   }else{if(r.render||r.postState)throw new Error('Unexpected worker targets');modalOutputs.set(st.renderAge,output);}
   st.renderAge=r.counter;renderedBlocks++;
  }
  const value=runtime.process({samples,baseDuration,timestep});
  check('envelope:after',value,r.position);envelopeCompleted.set(r.thread,r);blocks++;
 }else if(['injectionEntry','injectionMixed','consumerPost','consumerCross',...(d.earlyConsumer?['groupControl','groupControlAfter']:[]),...(d.voiceRattleAudio?['audioGain','audioEntry','audioReturn']:[]),...(d.voiceTailEnvelopes?['audioAfterGains','audioTail']:[])].includes(r.stage)){
  voice(r);if(!consumerInjection)throw new Error('Unexpected injection observation');
 }else if(r.stage==='consumer'){
  voice(r);if(!consumerDelay)throw new Error('Unexpected consumer target');consumerConfig(r.controls);
  const previous=consumerCompared.get(r.epoch);if(r.counter%64||previous!==undefined&&r.counter!==previous+64)throw new Error('Noncontiguous consumer targets');
  const own=consumerUntil(r.epoch,r.counter+64);if(own.mute!==r.controls.mute)throw new Error('Consumer mute transition not yet verified');
  const output=own.outputs.get(r.counter);if(!output||r.channels.length!==output.length)throw new Error('Complete consumer channels required');
  for(let g=0;g<output.length;g++){if(r.channels[g].length!==64)throw new Error('Complete consumer samples required');for(let i=0;i<64;i++)check('consumer:output',output[g][i],r.channels[g][i]);}
  compareDelayStates('consumer-after',own.states,r.delays);consumerCompared.set(r.epoch,r.counter);consumerComparedBlocks++;
 }else if(r.stage==='duplicateEnvelopeResult'){
  voice(r);const p=envelopeCompleted.get(r.thread);
  if(envelopePending.has(r.thread)||!p||p.epoch!==r.epoch||p.voice!==r.voice||p.modal!==r.modal||p.counter!==r.counter||bits(p.position)!==bits(r.position))throw new Error('Unproven duplicate return');
  duplicates++;
 }else throw new Error('Unknown update stage');
}
if(renderedBlocks!==expectedBlocks||comparedOutputBlocks!==expectedBlocks||refreshes!==(dispatchControls?d.refreshCount:windowBlocks)||initialStates.size!==5||!initialGroups||modeSeedBridges!==5||powCalls.length!==5||histories.size!==5||historyUpdates!==4||!randomDraws||sourceModels.size!==0||finalCalls!==5||oldReleasesComputed!==4||producerChecks.size!==5||copies!==d.copyCount||starts!==5||voices.size!==5||epochs.size!==5||spectrumCalls!==10||modes.size!==5||[...modes.values()].some(m=>m.size!==2)||duplicates!==(d.duplicateEnvelopeReturns??0)||blocks!==d.envelopeBlocks||envelopePending.size||coefficients!==d.coefficientCount||!active||!xChanges||pending.size)throw new Error('Incomplete dynamic update chain: '+JSON.stringify({renderedBlocks,expectedBlocks,comparedOutputBlocks,refreshes,expectedRefreshes:dispatchControls?d.refreshCount:windowBlocks,initialStates:initialStates.size,initialGroups,modeSeedBridges,powCalls:powCalls.length,histories:histories.size,historyUpdates,randomDraws,sourceModels:sourceModels.size,finalCalls,oldReleasesComputed,producerChecks:producerChecks.size,copies,expectedCopies:d.copyCount,starts,voices:voices.size,epochs:epochs.size,spectrumCalls,modes:modes.size,duplicates,expectedDuplicates:d.duplicateEnvelopeReturns??0,blocks,expectedEnvelopeBlocks:d.envelopeBlocks,envelopePending:envelopePending.size,coefficients,expectedCoefficients:d.coefficientCount,active,xChanges,pending:pending.size,mismatches}));
if(!workerOutputs&&dispatchControls&&(dispatchAges.length!==windowBlocks+1||refreshes+skippedRefreshAges.length!==windowBlocks||pendingRefreshAge!==undefined))throw new Error('Incomplete conditional refresh decisions');
if(workerOutputs&&(pendingRefreshByVoice.size||dispatchAgesByVoice.size!==5||[...dispatchAgesByVoice].some(([epoch,ages])=>initialStates.get(epoch).renderAge!==ages.length*64)||refreshes+skippedRefreshAges.length!==expectedBlocks-5||postStateBlocks!==expectedBlocks))throw new Error('Incomplete all-voice worker chain');
if(consumerDelay&&(consumerVoices.size!==5||consumerCompared.size!==5||consumerPreBlocks!==copies||consumerComparedBlocks!==d.records.filter(r=>r.stage==='consumer').length))throw new Error('Incomplete consumer verification chain');
const consumerCoverage=[];
if(consumerDelay)for(const [epoch,own] of consumerVoices){
 const pre=d.records.filter(r=>r.stage==='copy'&&r.epoch===epoch),after=d.records.filter(r=>r.stage==='consumer'&&r.epoch===epoch);
 if(after.at(-1).counter<pre.at(-1).counter||epoch===4&&after[0].counter!==0)throw new Error('Consumer output observation boundary missing');
 consumerUntil(epoch,Math.max(pre.at(-1).counter,after.at(-1).counter)+64);
 consumerCoverage.push({epoch,calculatedBlocks:own.age/64,preStateObservations:pre.length,outputObservations:after.length,firstOutputAge:after[0].counter,lastOutputAge:after.at(-1).counter});
}
if(sourceCommits&&(sourcePending!==undefined||!sourceCommitCount||sourceCommitCount!==modalCommitCount+sourceSkipCount))throw new Error('Incomplete actual source commits');
const initialPredictions=initialSnapshots;
const finalVoiceStates=[...initialStates].map(([epoch,s])=>({epoch,sampleAge:s.renderAge,readyAge:s.readyAge,coefficientAge:s.coefficientAge,positionWeightWarmupBlocks:s.positionWarmupBlocks,positionWeightsReady:s.positionWeightsReady,positionWeightPosition:s.positionWeightPosition,layout:s.layout,controls:s.controls,onsetParameters:s.onsetParameters,lanes:[...s.states].map(([lane,state])=>({lane,...state}))}));
const auxiliarySource=auxiliarySourceDirectory?produceAuxiliaryMidSource(auxiliarySourceDirectory,{archiveSourcePath:computedReleaseWaveform?archiveSourcePath:undefined,poisonReleaseWaveTarget,generatedSelections:computedAuxiliaryWaveforms?initializationRandom:undefined,poisonGeneratedWaveTarget,poisonGeneratedSelectionTarget}):null;
if(auxiliarySource){
 const identity=preparedSources?.archiveIdentity,f=auxiliarySource.fixture;
 if(auxiliarySource.report.mismatches)fs.writeFileSync(output+'.auxiliary-failure.json',JSON.stringify({computedAuxiliaryWaveforms,computedReleaseWaveform,passed:false,auxiliarySourceProducer:auxiliarySource.report},null,2)+'\n',{flag:'wx',mode:0o600});
 if(auxiliarySource.report.mismatches||auxiliarySource.midControls.size!==3314||!identity||identity.presetSha256!==f.selection.sha256||identity.resourceSha256!==f.resourceSha256||preparedSources.metadata.eventVelocityMidiSha256!==f.midiSha256)throw Error('Passed identical freshly calculated auxiliary source required');
}
const injectionStartChecks=checks,injectionStartMismatches=mismatches;
const injection=consumerInjection?verifyConsumerInjection(d,consumerOutputs,check,context=>{comparisonContext=context;},archiveRepeatModel):undefined;
if(injection){injection.checks=checks-injectionStartChecks;injection.mismatches=mismatches-injectionStartMismatches;injection.passed=injection.mismatches===0;}
const crossStartChecks=checks,crossStartMismatches=mismatches;
const cross=dataConsumerCross();
function dataConsumerCross(){if(d.consumerCross!==true)return;const result=verifyConsumerCross(d,injection,check,context=>{comparisonContext=context;},auxiliarySource?.preMidVoices,auxiliarySource?.voices);result.checks=checks-crossStartChecks;result.mismatches=mismatches-crossStartMismatches;result.passed=result.mismatches===0;return result;}
const rattleStartChecks=checks,rattleStartMismatches=mismatches;
const rattleAudio=d.voiceRattleAudio?verifyVoiceRattleAudio(d,cross,rattleAudioControls,check,context=>{comparisonContext=context;}):undefined;
if(rattleAudio){rattleAudio.checks=checks-rattleStartChecks;rattleAudio.mismatches=mismatches-rattleStartMismatches;rattleAudio.passed=rattleAudio.mismatches===0;}
const tailStartChecks=checks,tailStartMismatches=mismatches;
const tailEnvelopes=d.voiceTailEnvelopes?verifyVoiceTailEnvelopes(d,rattleAudio,check,checkDouble,context=>{comparisonContext=context;},computedTerminalSlopes?terminalSlopeModels:undefined):undefined;
if(computedTerminalSlopes&&(!tailEnvelopes?.terminalSlopesComputed||terminalSlopeModels.size!==5))throw new Error('Requested terminal source models were not consumed');
if(tailEnvelopes){tailEnvelopes.checks=checks-tailStartChecks;tailEnvelopes.mismatches=mismatches-tailStartMismatches;tailEnvelopes.passed=tailEnvelopes.mismatches===0;}
const pitchVelocityProducerComputed=!!pitchSource&&pitchModels.length===5&&pitchModels.every(x=>x.velocityProducerControlsFromArchive===true);
const preparedSourceReport=preparedSources?{...preparedSources.metadata,consumedTables:preparedSources.verifyComplete(),runtimeAudit:preparedSources.audit?.(),blendHostRuntime:archiveSourcePath?pitchSource.velocityRuntime:undefined}:undefined;
if(computedReleaseModel&&(releaseModels.size!==5||releaseModelSources.size!==5))throw new Error('Five complete own release model initializations required');
if(poisonModalClockTarget&&!modalClockTargetPoisoned)throw Error('Modal clock negative target not exercised');
if(poisonDispatchTarget&&!dispatchTargetPoisoned)throw Error('Dispatch negative target not exercised');
function calculatedAudioHash(items,terminal=false){
 const hash=crypto.createHash('sha256'),word=Buffer.alloc(4);
 for(const item of items??[])for(const channel of terminal?[...item.channels,...item.auxiliary]:item.channels)
  for(const sample of channel){word.writeFloatLE(sample);hash.update(word);}
 return hash.digest('hex');
}
const computedContinuousAudioSha256=calculatedAudioHash(continuousOutputs);
const computedTerminalAudioSha256=tailEnvelopes?calculatedAudioHash(tailEnvelopes.outputs,true):null;
const report={computedAuxiliaryWaveforms,computedReleaseWaveform,computedExtraGain,extraGainTargetPoisoned,extraGainObserved:!computedExtraGain,extraGainSources:[...extraGainSources].map(([epoch,value])=>({epoch,...value})),nonzeroExtraGainImplemented:false,computedDampingProfile,dampingProfile:ownDampingProfile,dampingProfileTargetPoisoned,dampingShapeCounts,dampingShapeAndBandsObserved:!computedDampingProfile,computedHeaderRatios,headerRatioTargetPoisoned,headerRatios:ownHeaderRatios,headerRatioFixedOfflineProfileExplicit:computedHeaderRatios,decayScaleObserved:!computedHeaderRatios,computedModalClock,modalClock:ownModalClock,modalClockTargetPoisoned,modalBlockLengthAndFactorObserved:!computedModalClock,envelopeBlockSamplesObserved:!computedModalClock,computedContinuousAudioSha256,computedTerminalAudioSha256,auxiliarySourceProducer:auxiliarySource?{...auxiliarySource.report,predictions:undefined,inputFiles:auxiliarySource.inputFiles}:null,computedReleaseModel,releaseModelSources:[...releaseModelSources].map(([epoch,source])=>({epoch,...source})),releaseModels:[...releaseModels].map(([epoch,model])=>({epoch,...model})),releasePolynomialTailObserved:!computedReleaseModel,releasePolynomialTailFromArchive:computedReleaseModel,releaseRateScaleObserved:!computedReleaseModel,releaseRateScaleFromOwnMergedDecay:computedReleaseModel,releaseDurationStillObserved:!durationSource,releaseDurationFromArchiveAndOwnTuning:!!durationSource,durationSourceSha256,durationModels:[...durationModels].map(([epoch,model])=>({epoch,...model})),durationRegistryAndCurveModesStillObserved:!!durationSource,durationRuntimeBranchesStillExplicit:!!durationSource,captureSha256,passed:!mismatches,preparedSourceBridge:preparedSourceReport,computedTerminalSlopes,terminalSlopeModels:[...terminalSlopeModels].map(([epoch,model])=>({epoch,...model})),tailEnvelopes,archiveRepeatModelSource,sourceCommits,sourceCommitCount,modalCommitCount,sourceSkipCount,sourceDispatchControlsObserved:sourceCommits,lateGlobalDifferences,commitSlotCoverage,consumerInjection,injection,cross,rattleAudio,consumerUnwrittenRingIgnored:true,consumerDelay,consumerCoverage,fullConsumerTailImplemented:false,finalStereoAudioVerified:false,consumerPreBlocks,consumerComparedBlocks,consumerCalculatedBlocks,consumerOutputSamples:consumerComparedBlocks*3*64,consumerFirstCompared:[...consumerVoices].map(([epoch])=>({epoch,age:d.records.find(r=>r.stage==='consumer'&&r.epoch===epoch).counter})),consumerOutputs,workerOutputs,postStateBlocks,emptyVoiceBypassBlocks,voiceBlockCounts:[...dispatchAgesByVoice].map(([epoch,ages])=>({epoch,blocks:ages.length})),dispatchGateObserved:dispatchControls&&!computedDispatch,dispatchGateIndependentlyComputed:computedDispatch,computedDispatch,dispatchOrdinaryProfileStillExplicit:computedDispatch,dispatchTargetPoisoned,dispatchPolicies:[...ownDispatchPolicies].map(([epoch,p])=>({epoch,...p.summary()})),dispatchControls,dispatchAges,skippedRefreshAges,tailTwelveGroups,boundedWindow:!workerOutputs,windowBlocks:workerOutputs?undefined:windowBlocks,windowEnd:workerOutputs?undefined:windowEnd,finalVoiceStates,continuousOutputs,renderedBlocks,comparedOutputBlocks,continuousOutputSamples:outputSamples,refreshes,removals,onsetDurationComputedFromSource:true,onsetStatesCarried:true,pitchTrajectoryComputedFromArchive:!!pitchSource,pitchTrajectoryObserved:!pitchSource,adjustmentRatioObserved:!computedHeaderRatios,pitchSourceSha256,pitchModels,pitchReferenceDecayFromOwnSource:!!pitchSource,pitchControlAndCoefficientCacheSeparate:!!pitchSource,pitchVelocityProducerControlsStillExplicit:!!pitchSource&&!pitchVelocityProducerComputed,pitchVelocityProducerControlsFromArchive:pitchVelocityProducerComputed,pitchVelocityProducerControlsStillObserved:pitchSource?!pitchVelocityProducerComputed:undefined,pitchVelocityRuntimeConditionsStillExplicit:!!pitchSource,pitchZeroCentsRuntimeBranchSupplied:!!pitchSource,onsetInitializationComputed:computedOnsetInitialization,onsetDoubleStepAndFilterCoefficientsObserved:!computedOnsetInitialization,continuousInitialStatesComputed:true,continuousModalStatesCarried:true,workerAndConsumerClocksKeptSeparate:true,lateCopyPQNotUsed:true,weightDiagnostics,initialPredictions,checks,comparedFloatValues:checks-randomWordChecks-doubleChecks,comparedDoubleValues:doubleChecks,comparedRandomWords:randomWordChecks,initializationRandom,initializationRandomControlsObserved:initializationRandom.length===starts,initializationRandomOutputsNotDirectlyCompared:true,randomStateAtInitialVerified:!mismatchesByName['initial-random-state'],mismatches,modelInitializations:sourceModels.size,starts,spectrumCalls,finalCalls,spectrumRows:d.records.filter(r=>r.stage==='weights').reduce((n,r)=>n+r.count,0),copyCount:copies,oldReleasesComputed,envelopeBlocks:blocks,duplicateEnvelopeReturns:duplicates,coefficients,active,xChanges,byStage,sourceControlObserved:true,globalXAtCoefficientObserved:true,dynamicUpdateSiteNotObservedThisWindow:!sourceCommits,setterSiteNotObservedThisWindow:!sourceCommits,envelopeStatesCarried:true,envelopeDurationComputed:true,baseDurationAndTimestepObserved:!computedModalClock,modelInitializationSiteNotObservedThisWindow:true,coefficientModelFieldsObserved:true,coefficientTargetsComparisonOnly:true,activeCubeSiteNotObservedThisWindow:true,releaseFlagAndUObserved:!computedKeyRelease,computedKeyRelease,keySuppressions,keyUpdateSchedulingStillObserved:true,oldReleaseInputComputed:true,browserCompatibleRuntimeModuleUsed:true,browserCompatibleSpectrumModuleUsed:true,hardnessRepeatInputsComputed:true,spectrumHardnessComputed:true,logSpectrumComputed:true,logSpectrumSiteNotObservedThisWindow:true,hardnessScalarSiteNotObservedThisWindow:true,spectrumModelTablesAndOtherControlsObserved:true,expWeightsComputedAndCompared:true,weightedSourceComputedAsIntermediate:true,mergedExcitationSourceCompared:false,mergedSourceIntermediateComputed:true,modeSelectionComputed:true,nativeScalarLog2Implemented:true,selectionControlsObserved:true,mappedArraysComputed:true,nativeIndexAndLayoutComparisonOnly:true,rawInitialPQComputed:true,initialRadiiComputed:true,initialDampedQComputed:true,initialPositionWeightsObserved:false,initialPositionWeightsComputed:true,positionWeightsCachedUntilPositionChange:true,positionAndRolloffControlsObserved:!dampingSource,dampingControlsFromArchive:!!dampingSource,dampingSourceSha256,dampingModels:[...dampingModels].map(([epoch,model])=>({epoch,...model})),releaseGainControlsObserved:!dampingSource,releasePolynomialAndRateScaleStillObserved:!computedReleaseModel||!durationSource,positionRuntimeConditionsExplicit:!!dampingSource,positionReferenceAndCutoffComputed:true,nativeVectorCosImplemented:true,nativeIndexNotObservedThisWindow:true,energyNormalizationComputedFromOwnEnergy:true,initialReleaseRateAndGainComputed:true,pitchAndAdjustmentRatioObserved:!pitchSource||!computedHeaderRatios,timestepComputedFromSampleRate:true,initialGroups,perModeFinalSiteNotObservedThisWindow:true,postAndMergeComputed:true,phaseVariationComputed:true,weightedSiteNotObservedThisWindow:true,preWeightSourceCalculatedDuringReplay:preparedSources?.metadata.sourceTablesConstructedDuringReplay===true,preWeightSourceStillObserved:!preparedSources,preWeightSourceDerivedFromObservedContext:Boolean(preparedSources),nativeCosfFiniteRangeLimit:2**26,historyUpdates,randomDraws,supportHistoryVoices:histories.size,historyBetweenStrikesComputed:true,initialRandomStatePerVoiceObserved:!preparedSources?.metadata.primaryInitialRandomStateIndependentlyProduced,primaryToSecondarySeedComputed:true,modeSeedBridges,phaseRandomDraws,secondFamilyGateObserved:true,nativeExp2fLog10fImplemented:true,historyMathCandidatesUsed:false,mathCalls,powCalls,nativeDoublePowImplemented:nativePowMode,doublePowCandidateUsed:!nativePowMode,powCandidateExplicit:!nativePowMode,browserCosfCandidateUsed:false,normalHardnessCurvesStillObserved:!preparedSources?.metadata.normalHardnessKnotsAndValuesComputedFromArchive,otherHardnessControlsStillObserved:true,oldVoiceSelectionCountAndInitialHistoryObserved:true,oldVoiceSelectionStillObserved:!computedKeyRelease,oldVoiceLifetimePolicy:computedKeyRelease?'latest-same-key-own-modal-active':'observed',oldVoiceGeneralRetirementPolicyVerified:false,oldVoiceCounterStillObserved:!preparedSources?.metadata.oldVoiceCounterComputedFromMidi,oldRepeatDurationStillObserved:!preparedSources?.metadata.repeatDurationFromArchive,repeatHostRateStillObserved:!preparedSources?.metadata.repeatHostRateFromExplicitRender,oldVoiceCounterFromMidi:preparedSources?.metadata.oldVoiceCounterComputedFromMidi===true,rattleInitialValuesFromMidi:preparedSources?.metadata.rattleSourceValuesFromMidi===true,rattleSourceValuesStillObserved:!sourceCommits||!preparedSources?.metadata.rattleSourceValuesFromMidi,rattleTimelineSampledAtObservedConsumerAge:sourceCommits&&preparedSources?.metadata.rattleSourceValuesFromMidi===true,rattleRuntimeSchedulingComputed:false,noteOnVelocityStillObserved:!preparedSources?.metadata.eventVelocityComputedFromMidiAndArchive,oldVelocityStillObserved:!preparedSources?.metadata.eventVelocityComputedFromMidiAndArchive,continuousEnvelopeAndVoiceOrBrowserEquivalence:false,mismatchesByName,failures};if(tailStemsDirectory)report.voiceTailStems=report.passed?writeVoiceTailStems(d,report,tailStemsDirectory):{exported:false,reason:'Complete replay failed'};if(rattleStemsDirectory)report.voiceRattleStems=report.passed?writeVoiceRattleStems(d,report,rattleStemsDirectory):{exported:false,reason:'Complete replay failed'};if(postStemsDirectory)report.postConsumerStems=report.passed?writePostConsumerStems(d,report,postStemsDirectory):{exported:false,reason:'Complete replay failed'};if(stemsDirectory)report.workerStems=writeWorkerStems(report,stemsDirectory,d.records.find(r=>r.stage==='weights').selectionSource.sampleRate);fs.writeFileSync(output,stringifyWithNegativeZero(report,2)+'\n');if(terminalArtifactDirectory)writeTerminalArtifact(terminalArtifactDirectory,report,output,process.argv.slice(2));console.log(JSON.stringify({...report,tailEnvelopes:tailEnvelopes?{...tailEnvelopes,outputs:undefined}:undefined,rattleAudio:rattleAudio?{...rattleAudio,outputs:undefined,births:rattleAudio.births.length}:undefined,cross:cross?{...cross,outputs:undefined}:undefined,injection:injection?{...injection,outputs:undefined}:undefined,consumerOutputs:undefined,mathCalls:undefined,powCalls:undefined,initialPredictions:undefined,finalVoiceStates:undefined,continuousOutputs:undefined}));if(!report.passed)process.exitCode=1;
