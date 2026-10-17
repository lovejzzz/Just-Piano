// One immutable model/preset context for own stiffness, stretch and note inputs.
// Registry constants and runtime curve modes remain explicit dependencies.
import {sourceArchiveInputs,sourceStiffnessCents,archiveSourceControls} from './source-controls.mjs';
import {nativeSourceMath} from './native-source-math.mjs';
import {archiveStretchControls} from './stretch-rhs.mjs';
import {constructStretchTable} from './construct-stretch-table.mjs';
import {equalTemperamentBase,stretchFrequency,anchorFrequencyScale,finishTuning} from './source-tuning.mjs';
import {archiveModalSource,prepareModalInputs} from './modal-source.mjs';
import {archiveAmplitudeControls} from './source-amplitude-controls.mjs';
import {archivePhaseAmount} from './source-phase-controls.mjs';
import {prepareEndpointSourceTables} from './endpoint-source-reference.mjs';
import {constructArchiveSourceWeights} from './archive-source-weights.mjs';
import {archiveWeightControls} from './source-weight-controls.mjs';
const contexts=new WeakMap(),f=Math.fround;
const registryNames=['middleWeight','gramScale','pitchScale','referenceNote','anchorMultiplier'];
const physicalCurveNames=['B1b40','B1b98','B2560','A490','A4e0','Af48'];
const scalarMode=mode=>mode&&[0,1].includes(mode.flags)&&mode.special===0&&mode.dimension===1;
function state(context){const own=contexts.get(context);if(!own)throw new RangeError('Own constructed archive context required');return own;}
export function constructArchiveSourceContext({baseFields,presetFields,sourceCurveModes,stretchCurveMode,pitchCurveMode,registry}){
  if(!Array.isArray(baseFields)||!Array.isArray(presetFields)||!registry||registryNames.some(k=>!Number.isFinite(registry[k])))
    throw new RangeError('Decoded model/preset fields and all five explicit registry constants required');
  if(physicalCurveNames.some(k=>!scalarMode(sourceCurveModes?.[k]))||!scalarMode(stretchCurveMode)||!scalarMode(pitchCurveMode))
    throw new RangeError('Explicit ordinary scalar runtime modes for physical, stretch and pitch curves required');
  const own=structuredClone({baseFields,presetFields,sourceCurveModes,stretchCurveMode,pitchCurveMode,registry});
  const b=new Map(own.baseFields.map(x=>[x.object_offset,x.value])),a=new Map(own.presetFields.map(x=>[x.object_offset,x.value]));
  if(a.get(0x1398)!==0)throw new RangeError('Archive context requires supported ageing-zero branch');
  own.tuning=a.get(0x318);own.pitchCurve=a.get(0x3b0);own.modelReferenceHz=f(b.get(0x1b34));
  // This also validates the supported default tuning mapping before a build.
  const anchorBase=equalTemperamentBase(69,own.tuning,nativeSourceMath);
  const archive=sourceArchiveInputs(own.baseFields,own.presetFields);
  own.stiffnessTable=Array.from({length:128},(_,note)=>{
    const cents=sourceStiffnessCents(archive,note,own.sourceCurveModes,nativeSourceMath).cents;
    return nativeSourceMath.exp2(cents/600)-1;
  });
  own.stretchControls=archiveStretchControls(own.baseFields,own.presetFields,own.stretchCurveMode);
  own.stretch=constructStretchTable({controls:own.stretchControls,stiffnessTable:own.stiffnessTable,
    middleWeight:own.registry.middleWeight,gramScale:own.registry.gramScale});
  own.stretchAt=(note,noteIndex,baseFrequency)=>stretchFrequency({note,noteIndex,baseFrequency,
    stretchTable:own.stretch.table,modelReferenceHz:own.modelReferenceHz,
    registryPitchScale:own.registry.pitchScale,registryReferenceNote:own.registry.referenceNote},nativeSourceMath);
  own.anchorScale=anchorFrequencyScale(own.tuning.midi.float,own.stretchAt(69,69,anchorBase).frequency,own.registry.anchorMultiplier);
  own.physicalCache=new Map();
  const context=Object.freeze({schema:'archive-source-context',registryConstantsExplicit:true,runtimeCurveModesExplicit:true,
    stretchTableComputed:true,stiffnessTableComputed:true,completeVoiceVerified:false});
  contexts.set(context,own);return context;
}
// Copies for verification; consumers cannot replace the context's own tables.
export function archiveSourceContextAudit(context){
  const own=state(context),s=own.stretch;
  return {stiffnessTable:[...own.stiffnessTable],stretchTable:Array.from(s.table),rhs:Array.from(s.prepared.rhs),
    matrix:{rows:s.matrix.rows,columns:s.matrix.columns,layout:s.matrix.layout,values:Array.from(s.matrix.values)},
    solution:Array.from(s.solution),anchorScale:own.anchorScale,registry:{...own.registry}};
}
export function archiveTunedNote(context,{note,noteIndex=note}){
  const own=state(context);
  if(!Number.isInteger(note)||note<0||note>127||noteIndex!==note)throw new RangeError('Supported integer note/index mapping required');
  const baseline=equalTemperamentBase(note,own.tuning,nativeSourceMath),stretch=own.stretchAt(note,noteIndex,baseline);
  return {...finishTuning({note,baseFrequency:baseline,stretchedFrequency:stretch.frequency,anchorScale:own.anchorScale,
    modelReferenceHz:own.modelReferenceHz,pitchCurve:own.pitchCurve,runtimeCurveMode:own.pitchCurveMode,ageing:0},nativeSourceMath),
    stretchFactor:stretch.factor,stretchedFrequency:stretch.frequency};
}
export function archiveNoteSourceInputs(context,{note,noteIndex=note,amplitudeCurveModes,instrumentMode,phaseCurveMode}){
  const own=state(context);
  if(!Number.isInteger(note)||note<0||note>127||noteIndex!==note)throw new RangeError('Supported integer note/index mapping required');
  if(!Number.isInteger(instrumentMode)||instrumentMode<0||instrumentMode>255||!scalarMode(phaseCurveMode))
    throw new RangeError('Explicit instrument mode byte and ordinary phase curve mode required');
  if(!own.physicalCache.has(note))own.physicalCache.set(note,archiveSourceControls({baseFields:own.baseFields,presetFields:own.presetFields,
    note,runtimeCurveModes:own.sourceCurveModes,math:nativeSourceMath}));
  const physical=own.physicalCache.get(note),tuning=archiveTunedNote(context,{note,noteIndex});
  const modal=archiveModalSource({fields:own.baseFields},noteIndex);
  const prepared=prepareModalInputs({frequency:tuning.frequency,offsets:physical.offsets,offsetExponent:modal.offsetExponent,
    stiffness:physical.stiffness,componentStiffness:physical.componentStiffness,spread:physical.spread,
    frequencyRatios:physical.frequencyRatios,blend:modal.blend});
  const amplitudeArgs={baseFields:own.baseFields,presetFields:own.presetFields,note,runtimeCurveModes:amplitudeCurveModes};
  const amplitude={coupled:archiveAmplitudeControls({...amplitudeArgs,components:physical.offsets.length}),
    independent:archiveAmplitudeControls({...amplitudeArgs,components:1})};
  const phase=archivePhaseAmount({baseFields:own.baseFields,note,instrumentMode,runtimeCurveMode:phaseCurveMode});
  const weights=own.baseFields.find(x=>x.object_offset===0x1c28)?.value?.[noteIndex-1];
  if(!weights?.length||weights.length!==modal.coordinates.length||weights.some(x=>!Number.isFinite(f(x))))
    throw new RangeError('Complete archived harmonic weights matching modal coordinates required');
  return {note,noteIndex,physical:structuredClone(physical),tuning,modal,prepared,amplitude,phase,
    baseWeights:Float32Array.from(weights),harmonicWeightsComputed:false,registryConstantsExplicit:true,completeVoiceVerified:false};
}
export function prepareArchiveIndependentTables(context,{note,noteIndex=note,amplitudeCurveModes,instrumentMode,phaseCurveMode,
  weights,weightSource,integerScale,phaseConstant,jitterAmount,sampleRate,frequencyCutoff,impedanceRuntime,phaseOffsetControls}){
  const own=state(context),source=archiveNoteSourceInputs(context,{note,noteIndex,amplitudeCurveModes,instrumentMode,phaseCurveMode});
  if(source.modal.blend!==0)throw new RangeError('This archive requires a coupled endpoint; independent-only constructor cannot replace it');
  if(!Number.isInteger(integerScale)||!Number.isFinite(phaseConstant)||!impedanceRuntime)
    throw new RangeError('Explicit amplitude integer scale, phase constant and impedance runtime modes required');
  if(weightSource!==undefined&&weights!==undefined)throw new RangeError('Choose archive spectrum or explicit weights, not both');
  const spectrum=weightSource===undefined?undefined:archiveNoteSourceWeights(context,{...weightSource,note,noteIndex});
  const modal=source.modal;
  const independentSource={poleControls:{coordinateScale:modal.coordinateScale,coordinates:modal.coordinates,note,
    jitterAmount,sampleRate,frequencyCutoff,archiveContext:{...impedanceRuntime,baseFields:own.baseFields,presetFields:own.presetFields}},
    weights:spectrum?spectrum.output:weights,frequencyRatios:modal.frequencyRatios,componentAmplitudeScale:modal.componentAmplitudeScale,
    amplitudeControls:{...source.amplitude.independent,integerScale},phaseAmount:source.phase.phaseAmount,phaseConstant};
  const phaseOffsets=phaseOffsetControls===undefined?undefined:{coordinates:modal.coordinates,controls:phaseOffsetControls,phaseConstant};
  const tables=prepareEndpointSourceTables({prepared:source.prepared,independentSource,phaseOffsets});
  return {...tables,archivePhysicalSourceComputed:true,archiveTuningComputed:true,archiveAmplitudeSourceComputed:true,
    harmonicWeightsComputed:false,archiveSpectrumComputed:spectrum!==undefined,harmonicEditsExplicit:spectrum!==undefined,registryConstantsExplicit:true};
}

export function archiveNoteWeightControls(context,{note,runtimeCurveModes}) {
  const own=state(context);
  return archiveWeightControls({baseFields:own.baseFields,presetFields:own.presetFields,note,runtimeCurveModes});
}

export function archiveNoteSourceWeights(context,{note,noteIndex=note,runtimeCurveModes,harmonicEdits,weightOffset}) {
  const own=state(context),tuning=archiveTunedNote(context,{note,noteIndex});
  if(!own.physicalCache.has(note))own.physicalCache.set(note,archiveSourceControls({baseFields:own.baseFields,presetFields:own.presetFields,
    note,runtimeCurveModes:own.sourceCurveModes,math:nativeSourceMath}));
  return constructArchiveSourceWeights({baseFields:own.baseFields,presetFields:own.presetFields,note,noteIndex,runtimeCurveModes,
    frequency:tuning.frequency,stiffness:own.physicalCache.get(note).stiffness,harmonicEdits,weightOffset});
}
