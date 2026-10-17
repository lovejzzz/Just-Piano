// Historical note69/All=0 association; no nonzero-All or edit-mode claim.
import crypto from 'node:crypto';
import {archiveHardnessAt69} from '../dsp/model-curves.mjs';
const sha=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function computeArchiveHardnessSource(source){
  if(source?.schema!==1 || source.note!==69 || source.runtimeMode!=='linear-clamp' ||
      source.newlyObserved!==false || sha(source.fields)!==source.fieldsSha256)
    throw new Error('Explicit note69 archive hardness source and intact field digest required');
  const model=archiveHardnessAt69({...source.fields,note:69,runtimeMode:source.runtimeMode});
  return {model,curves:{primary:{knots:[...model.knots],values:[...model.tables[0]]},
    secondary:{knots:[...model.knots],values:[...model.tables[1]]}}};
}
export function prepareArchiveHardnessSource(base,preset){
  const offsets=new Set([0xde8,...[0xc58,0xe38].flatMap(start=>Array.from({length:5},(_,i)=>start+i*0x50))]);
  const fields={baseFields:base.fields.filter(row=>offsets.has(row.object_offset)),
    presetFields:preset.decoded_tail.fields.filter(row=>row.object_offset===0x9a8)};
  if(fields.baseFields.length!==11||fields.presetFields.length!==1)
    throw new Error('Complete eleven base curves and preset hardness compound required');
  const source={schema:1,note:69,runtimeMode:'linear-clamp',newlyObserved:false,fields,fieldsSha256:sha(fields)};
  return {source,...computeArchiveHardnessSource(source)};
}
