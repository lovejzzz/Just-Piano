// 7a4064..7a41dc: three cache controls selected from the base model.
import {impedancePhaseCurve} from './modal-impedance.mjs';
const f=Math.fround;
export function archiveSourceRuntimeControls({baseFields,note,cacheMode,instrumentMode,runtimeCurveMode}){
  if(!Array.isArray(baseFields)||!Number.isFinite(f(note))||f(note)<0||f(note)>127||![0,1].includes(cacheMode)||
    !Number.isInteger(instrumentMode)||instrumentMode<0||instrumentMode>255)
    throw new RangeError('Decoded base fields, finite MIDI coordinate, cache mode and instrument byte required');
  const fields=new Map(baseFields.map(r=>[r.object_offset,r.value])),compound=fields.get(0x2a38),model=fields.get(0x2548),curve=model?.curves?.[6];
  if(!curve||!runtimeCurveMode||runtimeCurveMode.flags!==0||runtimeCurveMode.special!==0||runtimeCurveMode.dimension!==1||
    !curve.y?.length||!curve.x||(curve.x.length&&curve.x.length!==curve.y.length)||![...curve.x,...curve.y].every(Number.isFinite))
    throw new RangeError('Explicit ordinary scalar B2740 runtime curve mode required');
  const frequencyCutoff=f(cacheMode===0?fields.get(0x164):compound?.scalar154);
  // Serialized compound version is not an in-memory scalar. Its second scalar
  // maps to B+2a3c; only instrument mode 1 copies it to cache+140.
  const jitterAmount=instrumentMode===1?f(compound?.scalars?.[1]):0;
  const evaluated=impedancePhaseCurve({...curve,...runtimeCurveMode},f(note));
  const decayFloorRatio=Math.min(f(1e6),Math.max(f(1),evaluated));
  if(![frequencyCutoff,jitterAmount,decayFloorRatio].every(Number.isFinite)||!(frequencyCutoff>0))
    throw new RangeError('Finite positive source cutoff and finite runtime controls required');
  return {frequencyCutoff,jitterAmount,decayFloorRatio,floorCurveValue:evaluated,cacheMode,instrumentMode,
    cutoffField:cacheMode===0?'B164':'B2a38.scalar154',jitterField:instrumentMode===1?'B2a38.scalars[1]':undefined,
    runtimeCurveModeExplicit:true,sourceRuntimeControlsComputed:true};
}
