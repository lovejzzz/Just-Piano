import assert from 'node:assert/strict';
import {trimSoundboardResponses} from '../dsp/soundboard-response-trim.mjs';
const a = Float32Array.of(1, 2, 3, 0, 0);
const b = Float32Array.of(0, 0, 0, 4, 0);
const result = trimSoundboardResponses([a, b], 0.001);
assert.equal(result.length, 4);
assert.equal(result.peak, 4);
assert.equal(result.taperCount, 3);
assert.equal(result.outputs[1][3], 0);
assert.equal(result.outputs[0][0], 1);
assert.deepEqual(Array.from(a), [1, 2, 3, 0, 0]);
// The native scan never selects length 1: no qualifying later sample retains
// the original length, including the all-zero and first-sample-only cases.
assert.equal(trimSoundboardResponses([Float32Array.of(1, 0, 0)], 0.01).length, 3);
assert.equal(trimSoundboardResponses([new Float32Array(5)], 0.01).length, 5);
assert.throws(() => trimSoundboardResponses([a, new Float32Array(3)], 0.001), /Aligned/);
assert.throws(() => trimSoundboardResponses([a], 0), /interval/);
console.log('PASS soundboard common tail scan, taper boundaries and guards');
