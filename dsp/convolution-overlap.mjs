// Fixed native inverse outputs: half-block overlap-add with reciprocal FFT scaling.
import {fma32} from './modal-kernel.mjs';
function normalizedOverlap(inverse,previousTail,size){
 if(inverse.length!==size*2||previousTail.length!==size)throw new Error('Unverified overlap size');
 const output=new Float32Array(size),tail=new Float32Array(size),scale=1/(size*2);
 for(let i=0;i<size;i++){
  output[i]=fma32(inverse[i],scale,previousTail[i]);
  tail[i]=Math.fround(inverse[i+size]*scale);
 }
 return {output,tail};
}

export function normalizedOverlap128(inverse,previousTail){return normalizedOverlap(inverse,previousTail,64);}
export function normalizedOverlap1024(inverse,previousTail){return normalizedOverlap(inverse,previousTail,512);}
