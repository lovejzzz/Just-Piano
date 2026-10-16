// Fixed native 128-point inverse output: 64-frame overlap-add, scale 1/128.
import {fma32} from './modal-kernel.mjs';
export function normalizedOverlap128(inverse,previousTail){
 if(inverse.length!==128||previousTail.length!==64)throw new Error('Unverified overlap size');
 const output=new Float32Array(64),tail=new Float32Array(64);
 for(let i=0;i<64;i++){
  output[i]=fma32(inverse[i],1/128,previousTail[i]);
  tail[i]=Math.fround(inverse[i+64]*(1/128));
 }
 return {output,tail};
}
