import assert from 'node:assert/strict';
import {nativeDoubleExp2} from '../dsp/native-double-exp2.mjs';
import {nativeDoubleLog2} from '../dsp/native-double-log2.mjs';
const view = new DataView(new ArrayBuffer(8));
const number = w => { view.setBigUint64(0, BigInt('0x' + w)); return view.getFloat64(0); };
const bits = x => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
// Independent host C outputs for seed 132 synthetic inputs.
for (const [input, expected] of [
  ['c0279fe4cdc00000', '3f3239262ebb83d6'],
  ['c0243f9502c00000', '3f4d5c593dbcfdef'],
]) assert.equal(bits(nativeDoubleExp2(number(input))), expected);
for (const [input, expected] of [
  ['3f9004cb7bde82d8', 'c017fe4589a71d90'],
  ['3fc40242ff7bd05b', 'c0056b62e8e5d876'],
  ['3feffffffffff000', 'bd671547652b88c3'],
  ['3feffffffffff001', 'bd6713d610b5360b'],
  ['00032e6ad00d4b2d', 'c09001524e02da19'],
  ['000224b90c4495ab', 'c0900399aaf26d53'],
]) assert.equal(bits(nativeDoubleLog2(number(input))), expected);
assert.equal(nativeDoubleExp2(-1074), Number.MIN_VALUE);
assert.equal(nativeDoubleExp2(-1075), 0);
assert.equal(nativeDoubleExp2(-Infinity), 0);
assert.equal(nativeDoubleExp2(Infinity), Infinity);
assert.equal(nativeDoubleExp2(1024), Infinity);
assert.equal(nativeDoubleExp2(-0), 1);
assert.equal(nativeDoubleExp2(0), 1);
assert(Number.isNaN(nativeDoubleExp2(NaN)));
assert.equal(nativeDoubleLog2(Number.MIN_VALUE), -1074);
assert.equal(nativeDoubleLog2(2), 1);
assert.equal(nativeDoubleLog2(0), -Infinity);
assert.equal(nativeDoubleLog2(-0), -Infinity);
assert(Object.is(nativeDoubleLog2(1), 0));
assert.equal(nativeDoubleLog2(Infinity), Infinity);
assert(Number.isNaN(nativeDoubleLog2(-1)));
assert(Number.isNaN(nativeDoubleLog2(NaN)));
assert.throws(() => nativeDoubleExp2('1'), /Binary64/);
assert.throws(() => nativeDoubleLog2('1'), /Binary64/);
console.log('PASS: native double exp2/log2 independent system fixtures, near-one compensation, range limits and subnormals');
