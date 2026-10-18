import assert from 'node:assert/strict';
import {normalizeSoundboardRows} from '../dsp/soundboard-sparse.mjs';
import {runSoundboardBlock, runSoundboardCompute} from '../dsp/soundboard-block.mjs';

const matrixA = normalizeSoundboardRows([
  {row: 0, entries: []}, {row: 1, entries: []},
], 2);
const matrixC = normalizeSoundboardRows([
  {row: 0, entries: []}, {row: 1, entries: []},
], 2);
const result = runSoundboardBlock({
  matrixA,
  matrixC,
  controls: {rho: 0, alpha: 0, beta: 0, eta: 0, epsilon: 1},
  current: Float32Array.from([0, 0]),
  previous: Float32Array.from([0, 0]),
  excitation: Float32Array.from([2]),
  excitationIndex: 1,
  weights: new Float32Array(65).fill(1),
});
assert.equal(result.block.length, 130);
assert.equal(result.block[0], 0);
assert.equal(result.block[1 * 65 + 1], 2);
assert.equal(result.block[1 * 65 + 2], 0);
assert.equal(result.current[1], 0);

assert.throws(() => runSoundboardBlock({
  matrixA, matrixC,
  controls: {rho: 0, alpha: 0, beta: 0, eta: 0, epsilon: 1},
  current: Float32Array.from([0]),
  previous: Float32Array.from([0, 0]),
  excitation: new Float32Array(1),
  excitationIndex: 0,
  weights: new Float32Array(65),
}), /length 2/);
assert.throws(() => runSoundboardBlock({
  matrixA, matrixC,
  controls: {rho: 0, alpha: 0, beta: 0, eta: 0, epsilon: 1},
  current: Float32Array.from([0, 0]),
  previous: Float32Array.from([0, 0]),
  excitation: new Float32Array(1),
  excitationIndex: 2,
  weights: new Float32Array(65),
}), /excitation index/);

const full = runSoundboardCompute({
  matrixA,
  matrixC,
  controls: {rho: 0, alpha: 0, beta: 0, eta: 0, epsilon: 1, steps: 128},
  weights: new Float32Array(128).fill(1),
  excitation: Float32Array.from([2]),
  excitationIndex: 1,
  captureBlockStarts: [0, 64],
});
assert.deepEqual(Object.keys(full.blocks), ['0', '64']);
assert.equal(full.blocks[0].length, 130);
assert.equal(full.current[1], 0);

console.log('PASS soundboard first-block replay contract and guards');
