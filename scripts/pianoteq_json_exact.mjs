import {randomUUID} from 'node:crypto';

// JSON.stringify normally changes -0 into +0. Capture perturbations and DSP
// reports must retain that sign because native comparisons are bitwise.
export function stringifyWithNegativeZero(value,space){
 const marker='__piano_negative_zero_'+randomUUID()+'__';
 const encoded=JSON.stringify(value,(_,v)=>{
  if(v===marker)throw new Error('Reserved negative-zero serialization marker');
  return Object.is(v,-0)?marker:v;
 },space);
 return encoded.replaceAll(JSON.stringify(marker),'-0');
}
