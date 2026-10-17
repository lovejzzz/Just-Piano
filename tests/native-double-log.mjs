import assert from 'node:assert/strict';
import {nativeDoubleLog} from '../dsp/native-double-log.mjs';
import {nativeScalarLog2f} from '../dsp/native-scalar-log2.mjs';

const view = new DataView(new ArrayBuffer(8));
function number(hex) {
  view.setBigUint64(0, BigInt('0x' + hex));
  return view.getFloat64(0);
}
function bits(value) {
  view.setFloat64(0, value);
  return view.getBigUint64(0).toString(16).padStart(16, '0');
}

// Independent host libm outputs, synthetic seed 125. No piano captures.
for (const [input, expected] of [
  ['3f8fbb78cd90c3d2', 'c010ab4c5ec41577'],
  ['3ffef0ce7f62ef9e', '3fe51a7a54d6fdbb'],
  ['3fafb43bb3fc6c12', 'c006414aa23ae72b'],
  ['00092b3e57332769', 'c08627a020e65800'],
  ['000dce46cb7ba32c', 'c0862459f3259d1d'],
  ['0001e8c358febcc7', 'c086342daf346506'],
  ['3feffffffffff000', 'bd60000000000400'],
  ['3feffffffffff001', 'bd5ffe00000007ff'],
  ['0170100000000000', 'c085a92570fdb3e7'],
  ['0000000000000001', 'c0874385446d71c3'],
]) assert.equal(bits(nativeDoubleLog(number(input))), expected);

assert.equal(bits(nativeDoubleLog(1)), '0000000000000000');
assert.equal(nativeDoubleLog(0), -Infinity);
assert.equal(nativeDoubleLog(-0), -Infinity);
assert.equal(nativeDoubleLog(Infinity), Infinity);
for (const x of [-1, -Number.MIN_VALUE, -Infinity, NaN])
  assert(Number.isNaN(nativeDoubleLog(x)));
assert.throws(() => nativeDoubleLog('1'), /Binary64/);

assert.equal(nativeScalarLog2f(2), 1);
assert.equal(nativeScalarLog2f(0), -Infinity);
assert.equal(nativeScalarLog2f(2 ** -149), -149);
assert.equal(nativeScalarLog2f(1 + 2 ** -24), 0);
assert(Number.isNaN(nativeScalarLog2f(-1)));
console.log('PASS: native double log system bit fixtures, reduction boundaries, subnormals, domain and log2f rounding');
