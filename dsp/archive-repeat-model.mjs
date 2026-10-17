// B+2100 v3 -> per-note G+378..394. Curves remain caller-supplied inputs.
import {linearModelCurve} from './model-curves.mjs';
import {initializeVoiceGroupEnvelope} from './voice-group-envelope.mjs';
export function archiveRepeatedStrikeFields({baseFields,note,sampleRate,runtimeMode}){
 const rows=baseFields?.filter(r=>r.object_offset===0x2100);
 if(rows?.length!==1||rows[0].kind!=='p02efc4')throw new Error('One decoded B+2100 model record required');
 const model=rows[0].value;
 if(model?.version!==3||model.curves?.length!==8)throw new Error('Verified eight-curve model version required');
 const fields={};
 model.curves.forEach((curve,i)=>{
  const values=linearModelCurve(curve,note,{runtimeMode});
  if(values.length!==1)throw new Error('Scalar repeated-strike curve required');
  fields['0x'+(0x378+4*i).toString(16)]=values[0];
 });
 return {note,fields,envelope:initializeVoiceGroupEnvelope(sampleRate,fields['0x378'])};
}
