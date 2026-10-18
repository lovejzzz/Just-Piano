import assert from 'node:assert/strict';
import {processSoundboardLeadingSilence} from '../dsp/soundboard-leading-silence.mjs';
const a = Float32Array.of(-0, 0, 2, 3);
const b = Float32Array.of(0, 4, 5, 6);
const independent = processSoundboardLeadingSilence([a, b], 1);
assert.deepEqual(independent.shifts, [2, 1]);
assert.deepEqual(Array.from(independent.outputs[0]), [2, 3, 0, 0]);
assert.deepEqual(Array.from(independent.outputs[1]), [4, 5, 6, 0]);
const common = processSoundboardLeadingSilence([a, b], 0);
assert.deepEqual(common.shifts, [1, 1]);
assert.deepEqual(Array.from(common.outputs[0]), [0, 2, 3]);
assert.deepEqual(Array.from(common.outputs[1]), [4, 5, 6]);
assert.equal(Object.is(a[0], -0), true);
assert.equal(processSoundboardLeadingSilence([new Float32Array(3)], 0).outputs[0].length, 0);
assert.deepEqual(Array.from(processSoundboardLeadingSilence([Float32Array.of(0, 1e-40)], 1).outputs[0]),
  [Math.fround(1e-40), 0]);
assert.throws(() => processSoundboardLeadingSilence([a], -1), /mode/);
assert.throws(() => processSoundboardLeadingSilence([Float32Array.of(NaN)], 1), /Finite/);
console.log('PASS native leading-zero scan, common/per-channel modes and exact-zero boundary');
