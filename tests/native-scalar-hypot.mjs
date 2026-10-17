import assert from 'node:assert/strict';
import {nativeScalarHypotf} from '../dsp/native-scalar-hypot.mjs';
const w = new DataView(new ArrayBuffer(4));
const from = x => {w.setUint32(0, x); return w.getFloat32(0);};
const bits = x => {w.setFloat32(0, x); return w.getUint32(0);};
// Independent system-library fixtures, including subnormal/overflow boundaries.
for (const [a,b,out] of [
  [0,0x80000000,0], [1,1,1], [3,4,5],
  [0x40400000,0x40800000,0x40a00000],
  [0x7f7fffff,0,0x7f7fffff], [0x7f7fffff,0x7f7fffff,0x7f800000],
  [0x7f800000,0x7fc00000,0x7f800000], [0x7fc00000,0xff800000,0x7f800000],
]) assert.equal(bits(nativeScalarHypotf(from(a), from(b))), out);
assert(Number.isNaN(nativeScalarHypotf(NaN, 1)));
assert.equal(nativeScalarHypotf(-3, -4), 5);
assert.equal(Object.is(nativeScalarHypotf(-0, -0), 0), true);
console.log('PASS: float hypot system fixtures, separate double arithmetic, signed zero, subnormal and special-value boundaries');
