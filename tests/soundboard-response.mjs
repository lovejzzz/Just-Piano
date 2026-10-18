import assert from 'node:assert/strict';
import {computeSoundboardResponses} from '../dsp/soundboard-response.mjs';

const propagation = {
  matrixA: [[]], matrixC: [[]],
  controls: {rho: 0, alpha: 0, beta: 0, eta: 1, epsilon: 1},
  steps: 128, weights: new Float32Array(129).fill(1),
  excitation: Float32Array.of(2), excitationIndex: 0,
};
const group = {offset: 0, entries: [{stateIndex: 0, a: 1, b: 0, c: 1}]};
const result = computeSoundboardResponses({propagation,
  observations: [{length: 200, groups: [group]}, {length: 200, groups: [{...group, offset: 3}]}],
});
assert.equal(result.blockCount, 2);
assert.equal(result.nativeBlockCacheUsed, false);
assert.equal(Object.keys(result.blocks).length, 0);
assert.equal(result.outputs[0][0], 0);
assert.equal(result.outputs[0][1], 2);
assert.equal(result.outputs[0][63], 2);
assert.equal(result.outputs[0][64], 2);
assert.equal(result.outputs[0][127], 2);
assert.equal(result.outputs[0][128], 0);
assert.equal(result.outputs[1][3], 0);
assert.equal(result.outputs[1][4], 2);
assert.equal(result.outputs[1][130], 2);
assert.throws(() => computeSoundboardResponses({propagation, observations: []}), /channel/);
assert.throws(() => computeSoundboardResponses({propagation: {...propagation, onBlock() {}},
  observations: [{length: 200, groups: [group]}]}), /observer/);
assert.throws(() => computeSoundboardResponses({propagation,
  observations: [{length: 64, groups: [group]}]}), /length/);
console.log('PASS streaming soundboard responses, block boundaries and channel offsets');
