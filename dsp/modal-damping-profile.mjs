// 1c84e8..85b4 and43e2a4..2dc: model curve inputs to modal damping.
import {linearModelCurve} from './model-curves.mjs';
import {runtimeCurveModeFromArchiveCurve} from './runtime-context-from-archive.mjs';
const f=Math.fround;
export function archiveModalDampingProfile({baseFields,note}) {
  if(!Array.isArray(baseFields)||!Number.isFinite(note))throw new RangeError('Model fields and finite note required');
  const fields=new Map(baseFields.map(r=>[r.object_offset,r.value]));
  for(const r of fields.get(0x2f10)?.fields??[])fields.set(0x2f10+r.object_offset,r.value);
  const at=offset=>{
    const curve=fields.get(offset);runtimeCurveModeFromArchiveCurve(curve,'damping profile');
    const values=linearModelCurve(curve,f(note),{runtimeMode:'linear-clamp'});
    if(values.length!==1||!Number.isFinite(values[0]))throw new RangeError('Finite scalar damping profile required');
    return f(values[0]);
  };
  const thresholdBase=at(0x3370),releaseShape=at(0x33c0),releaseHigh=at(0x3460);
  // Literal0x3f7d70a4 is the native float32 low/high spacing multiplier.
  const releaseLow=Math.min(at(0x3410),f(releaseHigh*f(0.99)));
  if(thresholdBase<0||releaseShape<=0||releaseLow<0||releaseHigh<=releaseLow)
    throw new RangeError('Supported positive damping shape and ordered bands required');
  return Object.freeze({thresholdBase,releaseShape,releaseLow,releaseHigh});
}
export function modalDampingShape(profile,{velocity,energy,releaseFlag}) {
  if(![velocity,energy].every(v=>Number.isFinite(v)&&Number.isFinite(f(v)))||velocity<0||energy<0||!Number.isInteger(releaseFlag)||releaseFlag<0||releaseFlag>255)
    throw new RangeError('Finite velocity, owned energy and release flag required');
  const threshold=f(profile.thresholdBase/Math.max(f(0.0001),f(f(velocity)*f(velocity))));
  return {releaseShape:releaseFlag===1&&f(energy)<threshold?profile.releaseShape:1,threshold};
}
