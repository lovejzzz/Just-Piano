import assert from 'node:assert/strict';
import {nativeDoubleTan} from '../dsp/native-double-tan.mjs';
const view = new DataView(new ArrayBuffer(8));
const number = word => { view.setBigUint64(0, BigInt('0x' + word)); return view.getFloat64(0); };
const bits = x => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
// Independent host C tan outputs from seed 126 synthetic inputs.
for (const [input, expected] of [
  ['c01f820c29c00000', '4045b7e8f3cbb1b5'],
  ['401ee3be6dc00000', '401e39a3c8487623'],
  ['c116f3329b800000', '401c7ae70d9e2229'],
  ['c11b550c5b800000', '3ff67b48a01cd94f'],
  ['3fe921fb54442518', '3fefffffffffefff'],
  ['bfe921fb54442518', 'bfefffffffffefff'],
  ['412000013be58240', '3ff000008006d793'],
  ['412303c8d5339055', '4004d0191e8672f1'],
  ['7fe5b30750579bdd', '3fe362e5ba8da992'],
  ['ffe5b30750579bdd', 'bfe362e5ba8da992'],
]) assert.equal(bits(nativeDoubleTan(number(input))), expected);
assert(Object.is(nativeDoubleTan(-0), -0));
assert(Object.is(nativeDoubleTan(0), 0));
assert.equal(nativeDoubleTan(Number.MIN_VALUE), Number.MIN_VALUE);
assert.equal(nativeDoubleTan(-Number.MIN_VALUE), -Number.MIN_VALUE);
for (const x of [Infinity, -Infinity, NaN]) assert(Number.isNaN(nativeDoubleTan(x)));
assert.throws(() => nativeDoubleTan('0'), /Binary64/);
console.log('PASS: native double tan system bit fixtures, reduction branches, huge angles, signed zero and domain');
