// 444f2c boundary extension and 655e40 two-filter dyadic synthesis.
import {fma32} from './modal-kernel.mjs';
import {auxiliaryWaveletBands} from './auxiliary-wavelet-bands.mjs';
const f=Math.fround;
const low=Float32Array.of(-.0625,0,.5625,1,.5625,0,-.0625);
const high=Float32Array.of(-.015625,0,.125,.25,-.71875,.25,.125,0,-.015625);
export function filterAuxiliarySymmetric(input,coefficients) {
 const x=Float32Array.from(input),b=Float32Array.from(coefficients),n=x.length,m=b.length;
 if(m<3||m>255||m%2!==1||n<m||!x.every(Number.isFinite)||!b.every(Number.isFinite))
  throw new RangeError('Finite source at least as long as an odd synthesis filter required');
 const half=(m-1)/2,extended=new Float32Array(n+m-1);
 extended.set(x,half);
 for(let j=1;j<=half;j++){
  extended[half-j]=x[j];extended[half+n-1+j]=x[n-1-j];
 }
 const output=new Float32Array(n);
 for(let i=0;i<n;i++){
  const position=i+m-1;let sum=f(b[0]*extended[position]),j=1;
  // The extracted first output is still in the wrapper's all-fused prefix.
  // Subsequent full-history sums round complete four-term products separately.
  if(position>=m&&m>4){
   const end=1+Math.floor((m-1)/4)*4;
   for(;j<end;j++)sum=f(sum+f(b[j]*extended[position-j]));
  }
  for(;j<m;j++)sum=fma32(b[j],extended[position-j],sum);
  output[i]=Math.abs(sum)<f(1e-20)?0:sum;
 }
 return output;
}
export function synthesizeAuxiliaryLevel(coarse,detail,frames) {
 if(!Number.isSafeInteger(frames)||frames<9||coarse.length!==Math.ceil(frames/2)||detail.length!==Math.floor(frames/2))
  throw new RangeError('Matching coarse/detail dyadic extents required');
 const even=new Float32Array(frames),odd=new Float32Array(frames);
 for(let i=0;i<coarse.length;i++)even[i*2]=coarse[i];
 for(let i=0;i<detail.length;i++)odd[i*2+1]=detail[i];
 const a=filterAuxiliarySymmetric(even,low),b=filterAuxiliarySymmetric(odd,high);
 for(let i=0;i<frames;i++)a[i]=f(a[i]+b[i]);
 return a;
}
export function auxiliaryWaveletReconstruction(descriptor) {
 const calculated=auxiliaryWaveletBands(descriptor);
 let samples=new Float32Array(Math.ceil(calculated.bands[0].reconstructedLength/2));
 for(const band of calculated.bands)samples=synthesizeAuxiliaryLevel(samples,band.samples,band.reconstructedLength);
 return {frames:calculated.frames,sampleRate:calculated.sampleRate,samples,fullWaveformImplemented:false};
}
