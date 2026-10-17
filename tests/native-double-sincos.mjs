import assert from 'node:assert/strict';
import {nativeDoubleSinCos} from '../dsp/native-double-sincos.mjs';
const view = new DataView(new ArrayBuffer(8));
const number = word => { view.setBigUint64(0, BigInt('0x' + word)); return view.getFloat64(0); };
const bits = x => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
// Ordinary independent C __sincos outputs, seed 126 synthetic inputs.
for (const [input, sine, cosine] of [
  ['c01f820c29c00000', 'bfeffdd476efd82e', 'bf97917804705bd9'],
  ['401ee3be6dc00000', '3fefb9311a78d1d8', '3fc0cb09898420b4'],
  ['c116f3329b800000', 'bfefb060efa4309f', 'bfc1cd808339de4e'],
  ['3fe921fb54442518', '3fe6a09e667f3624', '3fe6a09e667f4175'],
  ['412000013be58240', '3fe6a09ec10689d3', '3fe6a09e0bf7ec5c'],
  ['412303c8d5339055', 'bfedde93b63c1dbe', 'bfd6f657614373fb'],
  ['7fe5b30750579bdd', 'bfe094b50623b53e', 'bfeb5e852c581f13'],
  ['ffe5b30750579bdd', '3fe094b50623b53e', 'bfeb5e852c581f13'],
]) {
  const output = nativeDoubleSinCos(number(input));
  assert.equal(bits(output.sin), sine);
  assert.equal(bits(output.cos), cosine);
}
for (const x of [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE]) {
  const output = nativeDoubleSinCos(x);
  assert(Object.is(output.sin, x));
  assert.equal(output.cos, 1);
}
for (const x of [Infinity, -Infinity, NaN]) {
  const output = nativeDoubleSinCos(x);
  assert(Number.isNaN(output.sin) && Number.isNaN(output.cos));
}
assert.throws(() => nativeDoubleSinCos('0'), /Binary64/);
console.log('PASS: native double sincos system bit fixtures, compensated reduction, huge angles, signed zero and domain');
