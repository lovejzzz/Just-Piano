// 81d9e4: combine four real FFT lanes into the native unordered 128-point spectrum.
import {fma32} from './modal-kernel.mjs';
import {forwardRealCore32,buildRealCoreTwiddles32} from './real-fft-core.mjs';
const f=Math.fround,halfRoot=f(Math.SQRT1_2);
export function finalizeReal128(input,e){
 if(input.length!==128||e.length!==96)throw new Error('Unverified real FFT finalization size');
 const out=new Float32Array(128);
 for(let block=0;block<4;block++){
  const base=block*32;
  for(let lane=0;lane<4;lane++){
   const re=[],im=[];
   for(let j=0;j<4;j++){
    re[j]=lane===0?(block?input[base-4+j]:0):input[base+(lane-1)*8+4+j];
    im[j]=block||lane?input[base+lane*8+j]:0;
    if(j){
     const c=e[block*24+(j-1)*8+lane],s=e[block*24+(j-1)*8+4+lane];
     const r=re[j],v=im[j];re[j]=fma32(-s,v,f(r*c));im[j]=block?fma32(r,s,f(v*c)):f(f(r*s)+f(v*c));
    }
   }
   const sr02=f(re[0]+re[2]),dr02=f(re[0]-re[2]),sr13=f(re[1]+re[3]),dr31=f(re[3]-re[1]);
   const si02=f(im[0]+im[2]),di02=f(im[0]-im[2]),si13=f(im[1]+im[3]),di31=f(im[3]-im[1]);
   const values=[f(sr02+sr13),f(si02+si13),f(dr02+di31),f(dr31-di02),f(dr02-di31),f(di02+dr31),f(sr02-sr13),f(si13-si02)];
   for(let j=0;j<8;j++)out[base+j*4+lane]=values[j];
  }
 }
 const a=f(input[0]+input[2]),b=f(input[1]+input[3]);out[0]=f(a+b);out[4]=f(a-b);out[16]=f(input[0]-input[2]);out[20]=f(input[3]-input[1]);
 const c=f(f(input[125]-input[127])*halfRoot),d=f(f(input[125]+input[127])*halfRoot);
 out[8]=f(input[124]+c);out[12]=f(-input[126]-d);out[24]=f(input[124]-c);out[28]=f(input[126]-d);
 return out;
}
export function forwardReal128(input,e=buildRealFinalizeCoefficients128()){return finalizeReal128(forwardRealCore32(input,buildRealCoreTwiddles32()),e);}

// Fixed-size coefficient values verified against native plans; setup call path remains open.
export function buildRealFinalizeCoefficients128(){
 const e=new Float32Array(96),unit=f(-2*Math.PI/128);
 for(let block=0;block<4;block++)for(let j=1;j<4;j++){
  const base=f(unit*j),offset=block*24+(j-1)*8;
  for(let lane=0;lane<4;lane++){
   const angle=f(base*(block*4+lane));e[offset+lane]=f(Math.cos(angle));e[offset+4+lane]=f(Math.sin(angle));
  }
 }
 return e;
}
