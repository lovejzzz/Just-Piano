import assert from 'node:assert/strict';
import {nativeComplexReciprocal} from '../dsp/native-complex-reciprocal.mjs';
import {singleComponentPole} from '../dsp/single-component-pole.mjs';
import {coupledModes,fma64} from '../dsp/modal-poles.mjs';
import {fma64 as commonFma} from '../dsp/native-double-fma.mjs';
assert.equal(fma64,commonFma);
const view=new DataView(new ArrayBuffer(8));
const hex=x=>{view.setFloat64(0,x);return view.getBigUint64(0).toString(16).padStart(16,'0');};
const fword=x=>{view.setFloat32(0,x);return view.getUint32(0);};
// Independent compiler-runtime oracle fixtures, including subnormal results.
for(const [p,q,mode,center,re,im,frequency,decay] of [
  [1,0,1,440,'3ff0000000000000','0000000000000000',0x43dc0000,0x40000000],
  [0,1,1,440,'0000000000000000','bff0000000000000',0x43dc28be,0],
  [1,1,1,440,'3fe0000000000000','bfe0000000000000',0x43dc145f,0x3f800000],
  [-1,1,2,20,'bfe0000000000000','bfe0000000000000',0x41a28be6,0xc0000000],
  [Number.MAX_VALUE,Number.MAX_VALUE,1,440,'0002000000000000','8002000000000000',0x43dc0000,0],
]){
  const reciprocal=nativeComplexReciprocal(p,q),pole=singleComponentPole({p,q,mode,center});
  assert.equal(hex(reciprocal.real),re);assert.equal(hex(reciprocal.imaginary),im);
  assert.equal(fword(pole.frequency[0]),frequency);assert.equal(fword(pole.decay[0]),decay);
  assert.deepEqual(coupledModes([440],{p,q,mode,center,decay_floor_ratio:0}),pole);
  assert.deepEqual(coupledModes([880],{p,q,mode,center,decay_floor_ratio:1e9}),pole);
}
assert(singleComponentPole({p:0,q:-1,mode:1,center:0}).frequency[0]<0); // no N>=2 absolute value
assert(Object.is(nativeComplexReciprocal(-1,0).imaginary,-0));
assert.throws(()=>nativeComplexReciprocal(0,0));
assert.throws(()=>nativeComplexReciprocal(Infinity,1));
assert.throws(()=>singleComponentPole({p:1,q:1,mode:0,center:440}));
assert.throws(()=>singleComponentPole({p:Number.MIN_VALUE,q:Number.MIN_VALUE,mode:1,center:440}));
console.log('Single-component fast path, complex reciprocal bit fixtures, dispatcher and finite-output boundaries passed.');
