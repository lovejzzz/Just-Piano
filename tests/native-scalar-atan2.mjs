import assert from 'node:assert/strict';
import {nativeScalarAtan2f} from '../dsp/native-scalar-atan2.mjs';
const w = new DataView(new ArrayBuffer(4));
const from = x => {w.setUint32(0,x);return w.getFloat32(0);};
const bits = x => {w.setFloat32(0,x);return w.getUint32(0);};
// Independent system bits; negative-X zero/small-ratio is deliberately not pi.
for (const [y,x,out] of [
  [0,0x80000000,0x40490fda], [0x80000000,0x80000000,0xc0490fda],
  [0,0xbf800000,0x40490fda], [0x80000000,0xbf800000,0xc0490fda],
  [0x337fffff,0xbf800000,0x40490fda], [0x34800000,0xbf800000,0x40490fda],
  [0x3f800000,0x3f800000,0x3f490fdb], [0x3f800000,0xbf800000,0x4016cbe4],
  [0xbf800000,0xbf800000,0xc016cbe4], [0xbf800000,0x3f800000,0xbf490fdb],
  [0x7f800000,0x7f800000,0x3f490fdb], [0xff800000,0x7f800000,0xbf490fdb],
]) assert.equal(bits(nativeScalarAtan2f(from(y),from(x))),out);
assert(Object.is(nativeScalarAtan2f(-0,0),-0));
assert(Object.is(nativeScalarAtan2f(0,0),0));
assert(Number.isNaN(nativeScalarAtan2f(NaN,1)));
assert(Number.isNaN(nativeScalarAtan2f(1,NaN)));
const original = Math.atan2;
try {Math.atan2=()=>{throw Error('No JS atan2 fallback');};assert.equal(bits(nativeScalarAtan2f(1,1)),0x3f490fdb);}
finally {Math.atan2=original;}
console.log('PASS: native float atan2 quadrant, signed-zero, small-angle constant and infinity fixtures; no JS atan2 fallback');
