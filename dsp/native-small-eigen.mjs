// 6f30a0: extraction of 1x1 or 2x2 complex blocks, before general QR port.
// Matrix values are column-major interleaved complex doubles.
import {fma64} from './native-double-fma.mjs';
import {nativeComplexDivide} from './native-complex-reciprocal.mjs';
const multiply=(ar,ai,br,bi)=>[fma64(ar,br,-(ai*bi)),fma64(ai,br,ar*bi)];
function blockSqrt(real,imaginary){
  if(real===0){const x=Math.sqrt((imaginary>=0?imaginary:-imaginary)*.5);return [x,imaginary>=0?x:-x];}
  const magnitude=Math.sqrt(fma64(real,real,imaginary*imaginary));
  const t=Math.sqrt(((real>=0?real:-real)+magnitude)*2),x=t*.5;
  return real>0?[x,imaginary/t]:[(imaginary>=0?imaginary:-imaginary)/t,imaginary>=0?x:-x];
}
export function extractSmallEigenvalues({values,order,tolerance}){
  if(![1,2].includes(order)||values?.length!==order*order*2||
     ![...values,tolerance].every(Number.isFinite)||tolerance<0)
    throw new RangeError('Finite 1x1/2x2 column-major matrix and explicit nonnegative tolerance required');
  if(order===1)return {roots:Array.from(values),blocks:[1],nativeQrIterationComputed:false};
  const [ar,ai,cr,ci,br,bi,dr,di]=values;
  const subNorm=Math.sqrt(fma64(cr,cr,ci*ci)),aNorm=Math.sqrt(fma64(ar,ar,ai*ai));
  // The second diagonal's vector multiply/add is intentionally not fused.
  const dNorm=Math.sqrt(dr*dr+di*di),threshold=(tolerance+tolerance)*(aNorm+dNorm);
  if(subNorm<threshold)return {roots:[ar,ai,dr,di],blocks:[1,1],subNorm,threshold,nativeQrIterationComputed:false};
  const ad=multiply(ar,ai,dr,di),bc=multiply(br,bi,cr,ci),trace=[ar+dr,ai+di];
  const square=[fma64(trace[0],trace[0],-(trace[1]*trace[1])),(trace[0]*trace[1])+(trace[0]*trace[1])];
  const discriminant=[fma64(-(ad[0]-bc[0]),4,square[0]),fma64(-(ad[1]-bc[1]),4,square[1])];
  if(![...ad,...bc,...trace,...discriminant].every(Number.isFinite))
    throw new RangeError('Nonfinite complex multiply fallback is not implemented');
  const plus=blockSqrt(...discriminant),minus=blockSqrt(...discriminant);
  const roots=[(trace[0]+plus[0])*.5,(trace[1]+plus[1])*.5,(trace[0]-minus[0])*.5,(trace[1]-minus[1])*.5];
  if(!roots.every(Number.isFinite))throw new RangeError('Nonfinite block square-root branch is not implemented');
  return {roots,blocks:[2],trace,discriminant,subNorm,threshold,nativeQrIterationComputed:false};
}
// Finite nonzero-leading/constant quadratic route through the companion matrix.
// Trimming, general reduction and QR iteration remain separate work.
export function solveNativeQuadratic(coefficients,{tolerance}={}){
  if(coefficients?.length!==6||![...coefficients,tolerance].every(Number.isFinite)||tolerance<0||
     (coefficients[0]===0&&coefficients[1]===0)||(coefficients[4]===0&&coefficients[5]===0))
    throw new RangeError('Finite nonzero-leading/constant quadratic and explicit tolerance required');
  if(fma64(coefficients[0],coefficients[0],coefficients[1]*coefficients[1])===0||
     fma64(coefficients[4],coefficients[4],coefficients[5]*coefficients[5])===0)
    throw new RangeError('Native coefficient trimming underflow branch is not implemented');
  const a=nativeComplexDivide(-coefficients[2],-coefficients[3],coefficients[0],coefficients[1]);
  const b=nativeComplexDivide(-coefficients[4],-coefficients[5],coefficients[0],coefficients[1]);
  // 8d6d74/78 advance by order*16: coefficients occupy the first row
  // in this column-major view; 8d6d9c/da0 put +1 at the subdiagonal.
  const companion=[a.real,a.imaginary,1,0,b.real,b.imaginary,0,0];
  return {...extractSmallEigenvalues({values:companion,order:2,tolerance}),companion,
    algorithm:'recovered-native-quadratic-block',generalQrVerified:false};
}
