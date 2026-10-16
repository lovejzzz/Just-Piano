// Complete normal no-input modal groups, in native 16-lane / 8-lane order.
// Callers must provide actual padded P/Q/A/B, including the extra tail lanes.
import {renderSixteen,renderEight} from './modal-kernel.mjs';
export function renderModalVoiceBlock(states,layout,samples){
 if(!(states instanceof Map)||!layout.length||!Number.isInteger(samples)||samples<=0||samples%4)throw new RangeError('Modal states, layout and four-sample block required');
 return layout.map(([start,padded,capacity,count])=>{
  if(![start,padded,capacity,count].every(Number.isInteger)||start<0||start%4||count<0||count>capacity||padded<start+count)throw new RangeError('Normal modal group layout required');
  const length=Math.ceil(count/4)*4,prefix=Math.floor(length/16)*16,remainder=length-prefix;
  // 4903f4..41c masks small histories in the final four-lane vector before
  // each block. The bitwise mask clears negative zero to positive zero too.
  for(let lane=start+length-4;length&&lane<start+length;lane++){
   const row=states.get(lane);
   if(!row||!Number.isFinite(row.P)||!Number.isFinite(row.Q))throw new RangeError('Actual final-vector histories required');
   for(const key of ['P','Q'])if(Math.abs(row[key])<=Math.fround(1e-18))row[key]=0;
  }
  const chunks=Array.from({length:prefix/16},(_,i)=>[start+i*16,16]);
  // 7c0edc..ee4 subtracts two four-lane vectors per tail iteration.
  // A twelve-lane remainder therefore runs two eight-lane kernels.
  for(let offset=0;offset<remainder;offset+=8)chunks.push([start+prefix+offset,8]);
  const output=new Float32Array(samples);
  for(const [lane,width] of chunks){
   if(lane+width>padded)throw new RangeError('Kernel tail exceeds padded group');
   const rows=Array.from({length:width},(_,i)=>states.get(lane+i));
   if(rows.some(row=>!row||!['P','Q','A','B'].every(k=>Number.isFinite(row[k]))))throw new RangeError('Actual padded kernel states required');
   const P=Float32Array.from(rows,r=>r.P),Q=Float32Array.from(rows,r=>r.Q),A=Float32Array.from(rows,r=>r.A),B=Float32Array.from(rows,r=>r.B);
   (width===16?renderSixteen:renderEight)(P,Q,A,B,output);
   rows.forEach((row,i)=>{row.P=P[i];row.Q=Q[i];});
  }
  return output;
 });
}
