// 2ca5f4 -> 33eac8/1b8d84, general numerator/denominator path.
// Does not implement the wrapper's single-coefficient specializations.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround;
const floor=f(1e-20);
export function filterAuxiliaryAR(input,numerator,denominator) {
 const valid=a=>(Array.isArray(a)||a instanceof Float32Array)&&Array.from(a).every(v=>Number.isFinite(v)&&Number.isFinite(f(v)));
 if(!valid(input)||!valid(numerator)||!valid(denominator)||numerator.length<2||denominator.length<2||
    numerator.length>256||denominator.length>256||f(denominator[0])===0)
  throw new RangeError('Finite general AR arrays and a nonzero leading denominator required');
 const x=Float32Array.from(input),b=Float32Array.from(numerator),a=Float32Array.from(denominator);
 const y=new Float32Array(x.length),inverse=f(1/a[0]),prefix=Math.max(a.length,b.length);
 for(let n=0;n<x.length;n++){
  let sum=f(b[0]*x[n]),j=1;
  // In the full-history body, SIMD products are rounded separately and their
  // lanes are added in ascending coefficient order. Only the scalar tail fuses.
  if(n>=prefix&&b.length>4){
   const end=1+Math.floor((b.length-1)/4)*4;
   for(;j<end;j++)sum=f(sum+f(b[j]*x[n-j]));
  }
  for(;j<b.length&&j<=n;j++)sum=fma32(b[j],x[n-j],sum);
  for(j=1;j<a.length&&j<=n;j++)sum=fma32(-a[j],y[n-j],sum);
  y[n]=f(inverse*(Math.abs(sum)<floor?0:sum));
 }
 return y;
}
