import assert from 'node:assert/strict';
import {normalizeSoundboardResponses} from '../dsp/soundboard-response-normalization.mjs';
const input = Float32Array.of(1, -3);
const controls = {gain: 0.5, sampleRate: 2, impulseMix: 0};
const result = normalizeSoundboardResponses([input], controls);
assert.deepEqual(result.normalizations, [2]);
assert.deepEqual(result.scales, [0.25]);
assert.deepEqual(Array.from(result.outputs[0]), [0.25, -0.75]);
assert.deepEqual(Array.from(input), [1, -3]);
const zero = normalizeSoundboardResponses([new Float32Array(3)], controls);
assert.equal(zero.normalizations[0], Math.fround(0.00001));
assert.deepEqual(Array.from(zero.outputs[0]), [0, 0, 0]);
assert.deepEqual(Array.from(normalizeSoundboardResponses([input], {...controls, impulseMix: 1}).outputs[0]),
  [Math.fround(0.1), -0]);
assert.throws(() => normalizeSoundboardResponses([input], {...controls, sampleRate: 0}), /controls/);
assert.throws(() => normalizeSoundboardResponses([Float32Array.of(NaN)], controls), /response/);
console.log('PASS ordered soundboard normalization, floor, impulse endpoint and guards');
