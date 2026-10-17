import assert from 'node:assert/strict';
import {solveNativeCubic,nativeCubicQrStep,nativeQrTolerance,nativeQrAbsoluteFloor} from '../dsp/native-cubic-qr.mjs';
import {coupledModes,polynomialResidual} from '../dsp/modal-poles.mjs';
assert.equal(nativeQrTolerance,6.661338147750939e-16);
assert.equal(nativeQrAbsoluteFloor,2.2250738585072014e-308);
const coefficients=[1,0,-6,0,11,0,-6,0],copy=coefficients.slice(),result=solveNativeCubic(coefficients);
assert.deepEqual(coefficients,copy);assert.equal(result.roots.length,6);assert.ok(result.steps.length>0&&result.steps.length<300);
assert.equal(result.nativeQrIterationComputed,true);assert.equal(result.toleranceSupplierVerified,true);assert.equal(result.generalQrVerified,false);
for(let i=0;i<3;i++)assert.ok(polynomialResidual(coefficients,result.roots.slice(2*i,2*i+2))<1e-14);
const reals=[result.roots[0],result.roots[2],result.roots[4]].sort((a,b)=>a-b);
for(let i=0;i<3;i++)assert.ok(Math.abs(reals[i]-(i+1))<1e-13);
const matrix=[1,.5,2,-.25,0,0,3,-.5,4,.75,5,1,6,-1,7,.125,8,-.75];
for(const exceptionalShift of [false,true]){
  const original=matrix.slice(),step=nativeCubicQrStep({values:matrix,exceptionalShift});assert.deepEqual(matrix,original);
  const beforeNorm=matrix.reduce((s,x)=>s+x*x,0),afterNorm=step.values.reduce((s,x)=>s+x*x,0);
  assert.ok(Math.abs(beforeNorm-afterNorm)<1e-11);
  for(const part of [0,1]){
    const trace=a=>a[part]+a[8+part]+a[16+part];assert.ok(Math.abs(trace(matrix)-trace(step.values))<1e-13);
  }
  assert.ok(Math.abs(step.values[4])<1e-13&&Math.abs(step.values[5])<1e-13);
}
const args={p:100,q:50,mode:1,center:440,decay_floor_ratio:1e6,rootAlgorithm:'native-qr'};
const old=Object.fromEntries(['hypot','sin','cos','log','exp','pow'].map(k=>[k,Math[k]]));
try{
  for(const k in old)Math[k]=()=>{throw new Error('Independent root fallback forbidden');};
  const native=coupledModes([440,441,442],args);assert.equal(native.solver.algorithm,'recovered-native-cubic-qr');assert.equal(native.frequency.length,3);
  assert.ok(native.frequency.every(Number.isFinite));assert.ok(native.decay.every(Number.isFinite));
  assert.equal(coupledModes([440,441],args).solver.algorithm,'recovered-native-quadratic-block');
}finally{Object.assign(Math,old);}
assert.equal(solveNativeCubic(coefficients,{tolerance:1e-12}).toleranceSupplierVerified,false);
assert.throws(()=>solveNativeCubic(coefficients,{tolerance:0}),/positive tolerance/);
assert.throws(()=>solveNativeCubic(coefficients,{absoluteFloor:-1}),/absolute floor/);
assert.throws(()=>solveNativeCubic([1,0,2,0]),/cubic/);
assert.throws(()=>solveNativeCubic([1,0,2,0,3,0,0,0]),/trimming/);
assert.throws(()=>nativeCubicQrStep({values:[...matrix.slice(0,17),Infinity]}),/Finite 3x3/);
assert.throws(()=>nativeCubicQrStep({values:matrix,exceptionalShift:1}),/boolean/);
assert.throws(()=>coupledModes([440,441,442,443],args),/cubic/);
console.log('Native finite cubic QR roots/residuals, shift similarity, explicit N2/N3 dispatch and no independent fallback passed');
