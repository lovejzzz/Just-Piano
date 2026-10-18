import assert from 'node:assert/strict';
import {blendSoundboardResponses} from '../dsp/soundboard-response-blend.mjs';
const main = Float32Array.of(2, 4, -0);
const auxiliary = Float32Array.of(6, 8, 0);
assert.deepEqual(Array.from(blendSoundboardResponses([main, auxiliary], {
  mainCount: 1, coefficients: [0.25], kernelLength: 0,
}).outputs[0]), [3, 5, 0]);
assert.equal(Object.is(blendSoundboardResponses([main, auxiliary], {
  mainCount: 1, coefficients: [0], kernelLength: 0,
}).outputs[0][2], -0), true);
assert.deepEqual(Array.from(main), [2, 4, -0]);
assert.deepEqual(Array.from(blendSoundboardResponses([main, auxiliary], {
  mainCount: 1, coefficients: [1], kernelLength: 0,
}).outputs[0]), [6, 8, 0]);
assert.throws(() => blendSoundboardResponses([main, auxiliary], {
  mainCount: 1, coefficients: [0.25], kernelLength: 1,
}), /Convolving/);
assert.throws(() => blendSoundboardResponses([main], {
  mainCount: 1, coefficients: [0.25], kernelLength: 0,
}), /layout/);
console.log('PASS empty-kernel soundboard channel blending, endpoints and branch guards');
