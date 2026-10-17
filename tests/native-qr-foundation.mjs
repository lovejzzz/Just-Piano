import assert from 'node:assert/strict';
import {nativeHouseholderVector,nativeQrDeflation,constructNativeCompanion} from '../dsp/native-qr-foundation.mjs';
const simple=nativeHouseholderVector([3,0,0,4]);assert.deepEqual(Array.from(simple.values),[1,0,0,.5]);assert.equal(simple.sumSquares,25);
assert.deepEqual(Array.from(nativeHouseholderVector([0,0,0,0]).values),[1,0,0,0]);
const tiny=nativeHouseholderVector([2**-600,0,2**-600,0]);assert.deepEqual(Array.from(tiny.values),[1,0,2**-600,0]);
for(const n of [2,3,8,9]){
 const input=Array.from({length:2*n},(_,i)=>(i%3-1)*(i+1)/7),copy=input.slice(),v=nativeHouseholderVector(input).values;
 assert.deepEqual(input,copy);let norm=0,dotR=0,dotI=0;
 for(let i=0;i<n;i++){const r=v[2*i],im=v[2*i+1],xr=input[2*i],xi=input[2*i+1];norm+=r*r+im*im;dotR+=r*xr+im*xi;dotI+=r*xi-im*xr;}
 const beta=-2/norm,output=input.map((x,j)=>{const k=j-j%2,r=v[k],im=v[k+1];return x+beta*(j%2?r*dotI+im*dotR:r*dotR-im*dotI);});
 assert.ok(output.slice(2).every(x=>Math.abs(x)<1e-12),'Reflector must annihilate the complex tail');
}
const matrix=(n,subs)=>{const v=Array(2*n*n).fill(0);for(let i=0;i<n;i++)v[2*(i+n*i)]=1;for(let i=1;i<n;i++)v[2*(i+n*(i-1))]=subs[i-1];return v;};
const run=(n,subs,extra={})=>nativeQrDeflation({values:matrix(n,subs),order:n,relativeTolerance:0,absoluteFloor:0,...extra});
assert.equal(run(3,[1,1]).converged,0);assert.equal(run(3,[1,0]).converged,3);
assert.equal(run(4,[1,0,1]).converged,4);
assert.deepEqual([run(5,[0,1,1,1]).left,run(5,[0,1,1,1]).converged],[1,0]);
assert.deepEqual([run(5,[0,1,1,1],{converged:1}).left,run(5,[0,1,1,1],{converged:1}).converged],[1,1]);
assert.equal(run(3,[2,2],{relativeTolerance:1}).converged,0); // strict '<', equality is retained
const absolute=run(3,[1e-20,-0],{absoluteFloor:1e-10});assert.deepEqual(absolute.zeroed,[1,2]);assert.equal(absolute.converged,3);assert.ok(Object.is(absolute.values[2],0));
assert.deepEqual(nativeQrDeflation({values:[],order:0,relativeTolerance:0,absoluteFloor:0}).values,new Float64Array());
assert.throws(()=>nativeQrDeflation({values:matrix(3,[1,1]),order:3,relativeTolerance:0}),/thresholds/);
assert.throws(()=>nativeHouseholderVector([]),/Nonempty/);assert.throws(()=>nativeHouseholderVector([Infinity,0]),/finite/);
const old=Object.fromEntries(['hypot','sin','cos','pow','log','exp'].map(k=>[k,Math[k]]));
try{for(const k in old)Math[k]=()=>{throw new Error('Unrecovered math fallback forbidden');};assert.deepEqual(Array.from(nativeHouseholderVector([3,0,0,4]).values),[1,0,0,.5]);assert.equal(run(3,[1,1]).left,0);}finally{Object.assign(Math,old);}
const companion=constructNativeCompanion([1,0,-6,0,11,0,-6,0]);
assert.equal(companion.order,3);
assert.deepEqual(Array.from(companion.values),[6,-0,1,0,0,0,-11,0,0,0,1,0,6,-0,0,0,0,0]);
assert.throws(()=>constructNativeCompanion([0,0,1,0]),/trimming/);
console.log('Native reflector annihilation, scalar/SIMD lengths, zero/underflow, strict deflation thresholds and active block state passed');
