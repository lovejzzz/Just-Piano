// 5c38dc builds I+80 from A+d30; 1c54d0..5598 loads B1c88/B1ca0.
import {archiveHarmonicEdits} from './archive-harmonic-edits.mjs';
import {nativeScalarLogf} from './native-scalar-log.mjs';
import {nativeDoubleLog} from './native-double-log.mjs';
import {nativeDoubleExp} from './native-double-exp.mjs';
import {archiveWeightControls} from './source-weight-controls.mjs';
import {sourceWeights} from './source-weights.mjs';
const f=Math.fround;
function field(fields,offset){
  const row=fields?.find(r=>r.object_offset===offset);
  if(!row)throw new RangeError('Missing source weight archive field 0x'+offset.toString(16));
  return row.value;
}
function runtimeCurve(curve,mode,logPositive){
  if(!mode||mode.flags!==0||mode.special!==0||mode.dimension!==1||
     !Array.isArray(curve?.x)||!Array.isArray(curve.y)||!curve.y.length||
     (curve.x.length?curve.x.length!==curve.y.length:curve.y.length!==1)||
     ![...curve.x,...curve.y].every(Number.isFinite))
    throw new RangeError('Explicit linear scalar spectrum curve mode and complete archive curve required');
  const x=curve.x.map(value=>{value=f(value);return logPositive&&value>0?nativeScalarLogf(value):value;});
  if(x.some((value,i)=>!Number.isFinite(value)||(i&&!(value>x[i-1]))))
    throw new RangeError('Spectrum coordinates must increase after runtime conversion');
  return {x,y:curve.y.map(f),dimension:1,log_x:0,special_mode:0};
}
export function archiveWeightSpectrumInputs({baseFields,presetFields,note,noteIndex,runtimeCurveModes,frequency,stiffness}){
  if(!Number.isInteger(noteIndex)||noteIndex<1||noteIndex>127||![frequency,stiffness].every(x=>Number.isFinite(f(x)))||!(f(frequency)>0))
    throw new RangeError('Supported note index and finite physical controls required');
  const type=field(baseFields,0x158);
  if(type===3&&field(baseFields,0x15c)!==0)
    throw new RangeError('Alternate instrument weight transformation is not implemented');
  const controls=archiveWeightControls({baseFields,presetFields,note,runtimeCurveModes}).controls;
  const row=offset=>{
    const values=field(baseFields,offset)?.[noteIndex-1];
    if(!Array.isArray(values)||!values.length||!values.every(x=>Number.isFinite(f(x))))throw new RangeError('Complete archived source row required');
    return values.map(f);
  };
  const scalar=offset=>{
    const value=field(baseFields,offset)?.[noteIndex-1];
    if(!Number.isFinite(f(value)))throw new RangeError('Complete archived per-note weight scalar required');
    return f(value);
  };
  const active=field(presetFields,0xd80);
  if(!Number.isInteger(active)||active<0||active>0xffffffff)throw new RangeError('Unsigned spectrum activation flag required');
  return {weights:row(0x1c28),coordinates:row(0x1c40),controls,
    active_edit_curve:active!==0,
    edit_curve:runtimeCurve(field(presetFields,0xd30),runtimeCurveModes?.Ad30,true),
    base_curve:runtimeCurve(field(baseFields,0x18d0),runtimeCurveModes?.B18d0,false),
    G_controls:{'0x28':f(stiffness),'0x78':f(frequency),'0xd8':scalar(0x1c88),'0xf0':scalar(0x1ca0)}};
}
export function constructArchiveSourceWeights({harmonicEdits,harmonicCurveModes,weightOffset,...args}){
  if(harmonicEdits!==undefined&&harmonicCurveModes!==undefined)throw new RangeError('Choose computed or explicit harmonic edits, not both');
  const harmonic=harmonicEdits===undefined?archiveHarmonicEdits({...args,runtimeCurveModes:harmonicCurveModes}):undefined;
  const edits=harmonic?harmonic.values:harmonicEdits;
  const input=archiveWeightSpectrumInputs(args);
  const calculated=sourceWeights({...input,harmonic_edits:edits,weightOffset},{log:nativeDoubleLog,exp:nativeDoubleExp});
  return {...calculated,input,harmonicEdits:edits.slice(),harmonicAudit:harmonic,archiveSpectrumComputed:true,harmonicEditsExplicit:!harmonic,harmonicEditsComputed:!!harmonic,registryOffsetExplicit:true,
    completeWeightInputsComputed:false,completeVoiceVerified:false};
}
