// 432bc4: four real lanes + four imaginary lanes per group, real FFT endpoints.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround;
export function accumulatePackedRealSpectrum(a,b,destination,scale){
 if(a.length!==b.length||a.length!==destination.length||!a.length||a.length%8||
    a===destination||b===destination||!Number.isFinite(scale))throw new Error('Unverified packed product shape/aliasing');
 const oldDc=destination[0],oldNyquist=destination[4];
 for(let i=0;i<a.length;i+=8)for(let lane=0;lane<4;lane++){
  const ar=a[i+lane],ai=a[i+4+lane],br=b[i+lane],bi=b[i+4+lane];
  const imaginary=fma32(ai,br,f(ar*bi));
  const real=fma32(-ai,bi,f(ar*br));
  destination[i+lane]=fma32(real,scale,destination[i+lane]);
  destination[i+4+lane]=fma32(imaginary,scale,destination[i+4+lane]);
 }
 destination[0]=fma32(scale,f(a[0]*b[0]),oldDc);
 destination[4]=fma32(scale,f(a[4]*b[4]),oldNyquist);
 return destination;
}
