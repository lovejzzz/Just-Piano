// 19ad70 reflector vector and 3ea1ec deflation, prerequisites of native QR.
import {fma64} from './native-double-fma.mjs';
import {nativeComplexDivide} from './native-complex-reciprocal.mjs';
export function nativeHouseholderVector(input){
  if(!input?.length||input.length%2||![...input].every(Number.isFinite))
    throw new RangeError('Nonempty finite interleaved complex vector required');
  const values=Float64Array.from(input),count=values.length/2,prefix=Math.floor(count/8)*8;
  let sumSquares=0;
  // SIMD prefix computes each complex norm with FMA; scalar tail does not.
  for(let i=0;i<prefix;i++)sumSquares+=fma64(values[2*i],values[2*i],values[2*i+1]*values[2*i+1]);
  for(let i=prefix;i<count;i++)sumSquares+=values[2*i]*values[2*i]+values[2*i+1]*values[2*i+1];
  if(!Number.isFinite(sumSquares))throw new RangeError('Nonfinite Householder normalization is not implemented');
  let multiplier;
  if(sumSquares!==0){
    const norm=Math.sqrt(sumSquares),firstSquare=fma64(values[0],values[0],values[1]*values[1]);
    if(!Number.isFinite(firstSquare))throw new RangeError('Nonfinite Householder first magnitude is not implemented');
    if(firstSquare===0)multiplier={real:1/norm,imaginary:0};
    else{
      const firstNorm=Math.sqrt(firstSquare),scale=Math.max(Math.abs(values[0]),Math.abs(values[1]));
      const quotient=nativeComplexDivide(firstNorm/scale,0/scale,values[0]/scale,values[1]/scale);
      const divisor=norm+firstNorm;
      multiplier={real:quotient.real/divisor,imaginary:quotient.imaginary/divisor};
    }
    for(let i=0;i<count;i++){
      const ar=values[2*i],ai=values[2*i+1],br=multiplier.real,bi=multiplier.imaginary;
      values[2*i]=fma64(br,ar,-(bi*ai));values[2*i+1]=fma64(bi,ar,br*ai);
    }
  }
  if(![...values].every(Number.isFinite))throw new RangeError('Nonfinite complex multiplication fallback is not implemented');
  values[0]=1;values[1]=0;
  return {values,sumSquares,multiplier,nativeQrIterationComputed:false};
}
export function nativeQrDeflation({values,order,relativeTolerance,absoluteFloor,converged=0}){
  if(!Number.isInteger(order)||order<0||values?.length!==2*order*order||
     ![...values,relativeTolerance,absoluteFloor].every(Number.isFinite)||relativeTolerance<0||absoluteFloor<0||
     !Number.isInteger(converged)||converged<0||converged>order)
    throw new RangeError('Finite square complex matrix, explicit thresholds and valid converged count required');
  const matrix=Float64Array.from(values),zeroed=[];
  if(order<3)return {values:matrix,left:0,converged:order,zeroed,nativeQrIterationComputed:false};
  const index=(r,c)=>2*(r+order*c),zeroSub=i=>matrix[index(i,i-1)]===0&&matrix[index(i,i-1)+1]===0;
  for(let i=1;i<order-converged;i++){
    const s=index(i,i-1),a=index(i,i),b=index(i-1,i-1);
    const subNorm=Math.sqrt(fma64(matrix[s],matrix[s],matrix[s+1]*matrix[s+1]));
    const currentNorm=Math.sqrt(fma64(matrix[a],matrix[a],matrix[a+1]*matrix[a+1]));
    const priorNorm=Math.sqrt(matrix[b]*matrix[b]+matrix[b+1]*matrix[b+1]);
    const relative=relativeTolerance*(currentNorm+priorNorm);
    const absoluteNorm=Math.sqrt(matrix[s]*matrix[s]+matrix[s+1]*matrix[s+1]);
    if(subNorm<relative||absoluteNorm<absoluteFloor+absoluteFloor){matrix[s]=0;matrix[s+1]=0;zeroed.push(i);}
  }
  // A disconnected 1x1 or 2x2 trailing block already needs no QR iteration.
  let active=order-converged;
  while(active>2){
    if(zeroSub(active-1))converged++;
    else if(zeroSub(active-2))converged+=2;
    else break;
    active=order-converged;
  }
  if(active<=2){converged=order;active=0;}
  let left=active?active-2:0;
  while(left>0&&!zeroSub(left))left--;
  return {values:matrix,left,converged,zeroed,nativeQrIterationComputed:false};
}

// 8d6b34 non-trimming branch, preserving the native column-major layout.
export function constructNativeCompanion(coefficients){
  if(!coefficients?.length||coefficients.length%2||coefficients.length<4||![...coefficients].every(Number.isFinite))
    throw new RangeError('Finite complex polynomial coefficients required');
  const order=coefficients.length/2-1,last=coefficients.length-2;
  if(fma64(coefficients[0],coefficients[0],coefficients[1]*coefficients[1])===0||
     fma64(coefficients[last],coefficients[last],coefficients[last+1]*coefficients[last+1])===0)
    throw new RangeError('Native coefficient trimming underflow branch is not implemented');
  const values=new Float64Array(2*order*order);
  for(let column=0;column<order;column++){
    const q=nativeComplexDivide(-coefficients[2*(column+1)],-coefficients[2*(column+1)+1],coefficients[0],coefficients[1]);
    if(![q.real,q.imaginary].every(Number.isFinite))throw new RangeError('Nonfinite companion entries are not implemented');
    values[2*order*column]=q.real;values[2*order*column+1]=q.imaginary;
    if(column+1<order)values[2*(column+1+order*column)]=1;
  }
  return {values,order,nativeQrIterationComputed:false};
}
