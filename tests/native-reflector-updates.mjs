import assert from 'node:assert/strict';
import {applyNativeReflector,reduceNativeHessenberg} from '../dsp/native-reflector-updates.mjs';
const close=(a,b,scale=1)=>assert.ok(Math.abs(a-b)<2e-11*scale,`${a} differs from ${b}`);
const norm=values=>values.reduce((sum,x)=>sum+x*x,0);
// A complex Hermitian reflector is an involution on either side, including
// rectangular subviews. Check isolation separately from its algebraic property.
for(const side of ['left','right']){
  const rows=5,columns=4,values=Array.from({length:2*rows*columns},(_,i)=>(i%11-5)/7);
  const vector=side==='left'?[1,0,.25,-.5,-.125,.75]:[1,0,.25,-.5];
  const args={values,rows,columns,side,vector,rowStart:1,rowEnd:4,columnStart:1,columnEnd:3};
  const copy=values.slice(),vCopy=vector.slice(),once=applyNativeReflector(args);
  const twice=applyNativeReflector({...args,values:once.values});
  assert.deepEqual(values,copy);assert.deepEqual(vector,vCopy);
  for(let c=0;c<columns;c++)for(let r=0;r<rows;r++)for(let part=0;part<2;part++){
    const k=2*(r+rows*c)+part;
    if(r<1||r>=4||c<1||c>=3)assert.ok(Object.is(once.values[k],values[k]),'Subview must not modify outside entries');
    close(twice.values[k],values[k]);
  }
  close(norm(once.values),norm(values),norm(values));
  assert.equal(once.nativeQrIterationComputed,false);
}
// A simple reflector flips the selected first row/column, with no tail rotation.
const diagonal=[1,0,0,0,0,0,2,0];
assert.deepEqual(Array.from(applyNativeReflector({values:diagonal,rows:2,columns:2,vector:[1,0,0,0],side:'left'}).values),[-1,0,0,0,0,0,2,0]);
for(const order of [0,1,2,3,5,9]){
  const input=Array.from({length:2*order*order},(_,i)=>((i*17+3)%23-11)/13),copy=input.slice();
  const result=reduceNativeHessenberg({values:input,order});
  assert.deepEqual(input,copy);assert.equal(result.stages.length,Math.max(0,order-2));
  assert.equal(result.nativeHessenbergComputed,true);assert.equal(result.nativeQrIterationComputed,false);
  // Similarity preserves trace and Frobenius norm, while entries below the
  // first subdiagonal vanish to rounding residuals (they are not forced to 0).
  close(norm(result.values),norm(input),Math.max(1,norm(input)));
  for(let part=0;part<2;part++){
    let before=0,after=0;for(let i=0;i<order;i++){before+=input[2*(i+order*i)+part];after+=result.values[2*(i+order*i)+part];}
    close(before,after,Math.max(1,order));
  }
  for(let c=0;c<order;c++)for(let r=c+2;r<order;r++){
    const k=2*(r+order*c);close(result.values[k],0,Math.max(1,order));close(result.values[k+1],0,Math.max(1,order));
  }
}
assert.throws(()=>applyNativeReflector({values:[1,0],rows:1,columns:1,side:'left',vector:[0,0]}),/positive reflector norm/);
assert.throws(()=>applyNativeReflector({values:[1,0],rows:1,columns:1,side:'left',vector:[1,0],rowEnd:2}),/valid submatrix/);
assert.throws(()=>applyNativeReflector({values:[1,0],rows:1,columns:1,side:'left',vector:[1,Infinity]}),/Finite complex vector/);
assert.throws(()=>reduceNativeHessenberg({values:[NaN,0],order:1}),/Finite square/);
assert.throws(()=>reduceNativeHessenberg({values:[1,0],order:2}),/Finite square/);
console.log('Complex reflector involution, subview isolation and Hessenberg similarity/annihilation properties passed');
