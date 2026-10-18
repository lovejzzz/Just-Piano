import assert from 'node:assert/strict';
import {convertSoundboardResponses} from '../dsp/soundboard-response-conversion.mjs';
const controls = {h: 0.5, tau: 0.25, speed: 4, density: 2};
const input = Float32Array.of(1, 3, -1, 10);
const derivative = convertSoundboardResponses([input], {...controls, mode: 0});
assert.equal(derivative.scale, -4);
assert.deepEqual(Array.from(derivative.outputs[0]), [-8, 16, 0]);
const direct = convertSoundboardResponses([input], {...controls, mode: 1});
assert.equal(direct.scale, 4);
assert.deepEqual(Array.from(direct.outputs[0]), [4, 12, -4, 0]);
assert.deepEqual(Array.from(input), [1, 3, -1, 10]);
assert.deepEqual(Array.from(convertSoundboardResponses([input], {...controls, mode: 1,
  logicalLength: 3}).outputs[0]), [4, 12, 0]);
assert.deepEqual(Array.from(convertSoundboardResponses([Float32Array.of(2, 3)],
  {...controls, mode: 0}).outputs[0]), [0]);
assert.deepEqual(Array.from(convertSoundboardResponses([Float32Array.of(2)],
  {...controls, mode: 1}).outputs[0]), [0]);
assert.throws(() => convertSoundboardResponses([input], {...controls, mode: 2}), /mode/);
assert.throws(() => convertSoundboardResponses([input], {...controls, mode: 0, tau: 0}), /controls/);
assert.throws(() => convertSoundboardResponses([input], {...controls, mode: 0, tau: 1e-99}), /float32/);
assert.throws(() => convertSoundboardResponses([input], {...controls, mode: 0, logicalLength: 5}), /length/);
assert.throws(() => convertSoundboardResponses([Float32Array.of(NaN)], {...controls, mode: 1}), /response/);
console.log('PASS soundboard response conversion, endpoint overwrite and input guards');
