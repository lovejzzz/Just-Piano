// 3d2600..3d26d4 -> packed record +0/+4/+8 -> 730878..730884 key +1c/+30/+34.
import {linearModelCurve} from './model-curves.mjs';
import {runtimeCurveModeFromArchiveCurve} from './runtime-context-from-archive.mjs';
const f=Math.fround;
function field(rows,offset,kind){
 const matches=rows?.filter(r=>r.object_offset===offset);
 if(matches?.length!==1||matches[0].kind!==kind)throw Error('Unique decoded raw-key field required: '+offset.toString(16));
 return matches[0].value;
}
export function archiveRawKeyControls({baseFields,presetFields,note}){
 if(!Number.isInteger(note)||note<0||note>127)throw Error('Explicit integer model note required');
 const block=field(baseFields,0x2f10,'mar_param');
 const override=field(presetFields,0x1168,'f32'),baseLimit=field(block.fields,0xe08,'u');
 if(!Number.isFinite(override)||!Number.isFinite(f(override))||!Number.isInteger(baseLimit)||baseLimit<0||baseLimit>0xffffffff)
  throw Error('Finite preset limit and unsigned base damper limit required');
 const damperLimit=f(override)===-1?f(baseLimit):f(override);
 function at(curve,label){
  runtimeCurveModeFromArchiveCurve(curve,label);
  const values=linearModelCurve(curve,note,{runtimeMode:'linear-clamp'});
  if(values.length!==1||!Number.isFinite(values[0]))throw Error('Ordinary scalar raw-key control curve required');
  return values[0];
 }
 return {flags:[Number(damperLimit>=f(note)),0,0],
  localControl:at(field(presetFields,0x1170,'curve'),'A1170 raw key'),
  localSoftControl:at(field(block.fields,0xc78,'c'),'B3b88 raw key')};
}
// 6d560c..6d5628: model/preset scalars copied to host +bc/+c0.
export function archiveRawHostDamperControls({baseFields,presetFields}){
 const block=field(baseFields,0x2f10,'mar_param');
 const hostControl=field(presetFields,0x116c,'f32'),hostBlend=field(block.fields,0xc70,'f');
 if(![hostControl,hostBlend].every(v=>Number.isFinite(v)&&Number.isFinite(f(v))))
  throw Error('Finite float32 raw host damper controls required');
 return {hostControl:f(hostControl),hostBlend:f(hostBlend)};
}
