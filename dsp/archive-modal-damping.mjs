// 1c5cc0..5d74, 321e78 and 43df50..df80: archive damping control sources.
// These controls do not establish a mechanical contact-force model.
import {linearModelCurve} from './model-curves.mjs';
import {runtimeCurveModeFromArchiveCurve} from './runtime-context-from-archive.mjs';
const f=Math.fround;
export function archiveModalDampingControls({baseFields,presetFields,note,positionRuntime}){
 if(!Array.isArray(baseFields)||!Array.isArray(presetFields)||!Number.isFinite(note)||positionRuntime!=='initialized-primary-no-overrides')
  throw new RangeError('Archive fields, finite note and explicit initialized position branch required');
 const b=new Map(baseFields.map(x=>[x.object_offset,x.value])),a=new Map(presetFields.map(x=>[x.object_offset,x.value]));
 for(const row of b.get(0x2f10)?.fields??[])b.set(0x2f10+row.object_offset,row.value);
 function at(map,offset){
  const curve=map.get(offset);runtimeCurveModeFromArchiveCurve(curve,'damping '+offset.toString(16));
  if(!Array.isArray(curve.x)||!Array.isArray(curve.y)||![...curve.x,...curve.y].every(x=>Number.isFinite(x)&&Number.isFinite(f(x))))throw new RangeError('Finite float32 damping curve required');
  const values=linearModelCurve(curve,note,{runtimeMode:'linear-clamp'});
  if(values.length!==1||!Number.isFinite(values[0]))throw new RangeError('Finite ordinary scalar damping curve required');
  return values[0];
 }
 const override=a.get(0x1110);
 if(!Number.isFinite(override)||!Number.isFinite(f(override))||f(override)<=0)throw new RangeError('Nonpositive position has unverified native loading semantics');
 const position=Math.min(.5,Math.max(f(.001),f(f(override)*at(a,0x1118)))),positionBranch='preset-product-clamped';
 const rolloff=at(b,0x3140),release={gainScale:at(b,0x3190),cubicGainScale:at(b,0x31e0),cubicScale:at(b,0x3230)};
 const polynomialTail=b.get(0x38e0);
 if(polynomialTail!==undefined&&(!Array.isArray(polynomialTail)||polynomialTail.length!==4||!polynomialTail.every(v=>Number.isFinite(v)&&Number.isFinite(f(v)))))throw new RangeError('Four finite float32 release polynomial tail values required');
 const extraCurve=b.get(0x3bd8);
 if(extraCurve)runtimeCurveModeFromArchiveCurve(extraCurve,'position-extra');
 if(position<.125&&!extraCurve)throw new RangeError('Archive position extra curve required below .125');
 if(!Number.isFinite(position)||rolloff<=0)throw new RangeError('Supported finite damping position and rolloff required');
 return {position,rolloff,release,...(polynomialTail?{polynomialTail:polynomialTail.map(f)}:{}),...(extraCurve?{extraCurve}:{}),positionBranch,controlsFromArchive:true,positionRuntimeExplicit:true,completeVoiceVerified:false};
}
