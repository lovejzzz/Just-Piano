// 846908 -> 71625c -> 43e128/43e1d4 zero-envelope branch -> 6e51a8.
// Nonzero transient synthesis is deliberately outside this branch.
import {linearModelCurve} from './model-curves.mjs';
import {runtimeCurveModeFromArchiveCurve} from './runtime-context-from-archive.mjs';
const f=Math.fround;
export function archiveZeroExtraDamping({baseFields,presetFields,note}) {
  const a=new Map(presetFields.map(r=>[r.object_offset,r.value]));
  const b=new Map(baseFields.map(r=>[r.object_offset,r.value]));
  for(const row of b.get(0x2f10)?.fields??[])b.set(0x2f10+row.object_offset,row.value);
  const evaluate=(curve,coordinate)=>{
    runtimeCurveModeFromArchiveCurve(curve,'extra damping');
    const values=linearModelCurve(curve,f(coordinate),{runtimeMode:'linear-clamp'});
    if(!values.length||!values.every(v=>Number.isFinite(v)&&Number.isFinite(f(v))))throw new RangeError('Finite extra damping curve required');
    return values;
  };
  const scalar=a.get(0x7d8),edit=evaluate(a.get(0x7e0),note);
  if(edit.length!==1||!Number.isFinite(scalar)||!Number.isFinite(f(scalar)))throw new RangeError('Scalar extra damping edit required');
  const gain=Math.min(6,Math.max(0,f(f(scalar)+edit[0])));
  if(gain!==0||a.get(0x880)?.integers?.[0]!==0)
    throw new RangeError('Nonzero or randomized extra damping transient is not implemented');
  const velocityValues=evaluate(b.get(0x38f8),note);
  if(velocityValues.length!==3)throw new RangeError('Three-value extra damping velocity curve required');
  return Object.freeze({gain,velocityValues:Object.freeze(velocityValues),randomDraws:0});
}
export function initializeZeroExtraDamping(profile,velocity) {
  if(!Number.isFinite(velocity)||velocity<0||velocity>1||profile.gain!==0||profile.randomDraws!==0||profile.velocityValues.length!==3)
    throw new RangeError('Supported zero-envelope profile and ordinary velocity required');
  const values=linearModelCurve({x:[0,0.5,1],y:profile.velocityValues},f(velocity),{runtimeMode:'linear-clamp'});
  if(!Number.isFinite(values[0]))throw new RangeError('Finite velocity interpolation required');
  // 43dcb0 explicitly initializes the zero curve and clears its tail state.
  return Object.freeze({extraGain:0,velocityValue:values[0],zeroEnvelope:true});
}
