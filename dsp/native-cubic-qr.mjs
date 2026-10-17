// 97cde0 / 484ce4, finite cubic eigenvalue-only route. General order is not ported.
import {fma64} from './native-double-fma.mjs';
import {nativeComplexDivide} from './native-complex-reciprocal.mjs';
import {constructNativeCompanion,nativeHouseholderVector,nativeQrDeflation} from './native-qr-foundation.mjs';
import {applyNativeReflector,reduceNativeHessenberg} from './native-reflector-updates.mjs';
import {extractSmallEigenvalues} from './native-small-eigen.mjs';
const magnitude=(r,i)=>Math.sqrt(fma64(r,r,i*i));
const finite=values=>{if(!values.every(Number.isFinite))throw new RangeError('Nonfinite cubic QR branch is not implemented');return values;};
// Initializer immediates 471fb0 / 028894, consumed by 8d6e18 / 3ea1ec.
export const nativeQrTolerance=3*Number.EPSILON;
export const nativeQrAbsoluteFloor=2**-1022;
export function nativeCubicQrStep({values,exceptionalShift=false}){
  if(values?.length!==18||![...values].every(Number.isFinite)||typeof exceptionalShift!=='boolean')
    throw new RangeError('Finite 3x3 complex matrix and explicit boolean shift required');
  let sr=values[16],si=values[17],tr=values[8],ti=values[9],pr,pi;
  if(exceptionalShift){
    const scale=magnitude(values[10],values[11])+magnitude(values[2],values[3]);
    sr=tr=scale*.75;si=ti=0;pr=scale*(scale*-.4375);pi=0;
  }else{
    pr=fma64(values[10],values[14],-(values[11]*values[15]));
    pi=fma64(values[11],values[14],values[10]*values[15]);
  }
  const ar=values[0],ai=values[1],ur=tr-ar,ui=ti-ai,vr=sr-ar,vi=si-ai;
  const productR=fma64(ur,vr,-(ui*vi)),productI=fma64(vr,ui,ur*vi);
  finite([sr,si,tr,ti,pr,pi,productR,productI]);
  const quotient=nativeComplexDivide(productR-pr,productI-pi,values[2],values[3]);
  const x=values[6]+quotient.real,xi=values[7]+quotient.imaginary;
  const y=((values[8]-ar)-ur)-vr,yi=((values[9]-ai)-ui)-vi,z=values[10],zi=values[11];
  // x/y magnitudes fuse real^2; z fuses imag^2, following the scalar/SIMD mix.
  const scale=(magnitude(y,yi)+magnitude(x,xi))+Math.sqrt(fma64(zi,zi,z*z));
  if(!(scale>0)||!Number.isFinite(scale))throw new RangeError('Finite nonzero cubic QR vector scale required');
  const seed=finite([x/scale,xi/scale,y/scale,yi/scale,z/scale,zi/scale]);
  const initial=nativeHouseholderVector(seed).values;
  const firstLeft=applyNativeReflector({values,rows:3,columns:3,vector:initial,side:'left'});
  const firstRight=applyNativeReflector({values:firstLeft.values,rows:3,columns:3,vector:initial,side:'right'});
  const final=nativeHouseholderVector(Array.from(firstRight.values.slice(2,6))).values;
  const finalLeft=applyNativeReflector({values:firstRight.values,rows:3,columns:3,rowStart:1,vector:final,side:'left'});
  const finalRight=applyNativeReflector({values:finalLeft.values,rows:3,columns:3,columnStart:1,vector:final,side:'right'});
  return {values:finalRight.values,seed,initial,final,exceptionalShift,nativeCubicStepComputed:true,generalQrVerified:false};
}
export function solveNativeCubic(coefficients,{tolerance=nativeQrTolerance,absoluteFloor=nativeQrAbsoluteFloor}={}){
  if(coefficients?.length!==8||![tolerance,absoluteFloor].every(Number.isFinite)||tolerance<=0||absoluteFloor<0)
    throw new RangeError('Finite cubic coefficients and explicit positive tolerance/nonnegative absolute floor required');
  const companion=constructNativeCompanion(coefficients).values;
  const hessenberg=reduceNativeHessenberg({values:companion,order:3});
  let state=nativeQrDeflation({values:hessenberg.values,order:3,relativeTolerance:tolerance,absoluteFloor});
  const steps=[];
  while(state.converged<3){
    const iteration=steps.length,step=nativeCubicQrStep({values:state.values,exceptionalShift:iteration===10||iteration===20});
    steps.push(step);
    state=nativeQrDeflation({values:step.values,order:3,relativeTolerance:tolerance+tolerance,absoluteFloor,converged:state.converged});
    if(steps.length>=300)throw new RangeError('Native cubic QR iteration budget exhausted');
  }
  // Follow native 6f30a0's ascending 1x1 / 2x2 scan; a split pair contributes
  // only its first diagonal here, then the following index is examined afresh.
  const roots=[],blocks=[];
  for(let start=0;start<3;){
    if(start===2){roots.push(state.values[16],state.values[17]);blocks.push(1);break;}
    const block=[];for(let c=start;c<start+2;c++)for(let r=start;r<start+2;r++){const k=2*(r+3*c);block.push(state.values[k],state.values[k+1]);}
    const result=extractSmallEigenvalues({values:block,order:2,tolerance});
    if(result.blocks[0]===1){roots.push(...result.roots.slice(0,2));blocks.push(1);start++;}
    else{roots.push(...result.roots);blocks.push(2);start+=2;}
  }
  return {roots,blocks,companion,hessenberg:hessenberg.values,values:state.values,steps,
    algorithm:'recovered-native-cubic-qr',nativeQrIterationComputed:true,
    toleranceSupplierVerified:tolerance===nativeQrTolerance&&absoluteFloor===nativeQrAbsoluteFloor,generalQrVerified:false};
}
