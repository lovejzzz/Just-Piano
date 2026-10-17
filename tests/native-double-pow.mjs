import assert from 'node:assert/strict';
import {nativeDoublePow} from '../dsp/native-double-pow.mjs';
const view = new DataView(new ArrayBuffer(8));
const number = w => { view.setBigUint64(0, BigInt('0x' + w)); return view.getFloat64(0); };
const bits = x => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
// Independent system pow outputs for synthetic seed 128 inputs.
for (const [x, y, expected] of [
  ['3ff12424ccc00000', '3ff05ba290000000', '3ff12ae9986de930'],
  ['3ffca77042800000', '400d206ed4000000', '4020b01bf5f2127e'],
  ['c58d903220000000', '4008000000000000', 'd0c93b797b95b3aa'],
  ['c6f1ad0fc0000000', '4008000000000000', 'd4f592ba1720e368'],
  ['3ef140bc4a37f22f', '3fd0000000000000', '3fb04dee71935fa8'],
  ['3a3b4ad63f55cfa6', '3fd0000000000000', '3e8249040f3ba574'],
  ['c00b4fb19dc00000', '4075300000000000', 'e576d720fc6c49bc'],
  ['bffa8a1d01000000', 'c07eb00000000000', 'a9873258af7c4315'],
  ['3feffffffffff000', '3fd0000000000000', '3feffffffffffc00'],
  ['4000000000000000', 'c090cbfffffffc00', '0000000000000001'],
]) assert.equal(bits(nativeDoublePow(number(x), number(y))), expected);
assert.equal(nativeDoublePow(2, 10), 1024);
assert.equal(nativeDoublePow(2, 1024), Infinity);
assert.equal(nativeDoublePow(2, -1074), Number.MIN_VALUE);
assert.equal(nativeDoublePow(2, -1075), 0);
assert(Object.is(nativeDoublePow(-0, 3), -0));
assert.equal(nativeDoublePow(-0, -3), -Infinity);
assert.equal(nativeDoublePow(-Infinity, 3), -Infinity);
assert(Object.is(nativeDoublePow(-Infinity, -3), -0));
assert(Number.isNaN(nativeDoublePow(-2, .25)));
assert.equal(nativeDoublePow(NaN, 0), 1);
assert.equal(nativeDoublePow(1, NaN), 1);
assert.equal(nativeDoublePow(-1, Infinity), 1);
assert.throws(() => nativeDoublePow('2', 3), /Binary64/);
assert.throws(() => nativeDoublePow(2, '3'), /Binary64/);
console.log('PASS: native double pow system bit fixtures, compensated reduction, subnormal rounding, negative bases and special values');
