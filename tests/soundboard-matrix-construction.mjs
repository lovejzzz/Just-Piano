import assert from 'node:assert/strict';
import {constructSoundboardGrid} from '../dsp/soundboard-grid.mjs';
import {constructSoundboardMatrices} from '../dsp/soundboard-matrix-construction.mjs';
import {solveSoundboardCg} from '../dsp/soundboard-cg.mjs';
const rows = [[{index: 0, value: -4}, {index: 1, value: 1}], [{index: 0, value: 1}, {index: 1, value: -4}]];
const solved = solveSoundboardCg(rows, Float32Array.of(-1, -1));
assert.equal(solved.iterations, 1);
assert.deepEqual(solved.solution, Float32Array.of(1 / 3, 1 / 3));
const zero = solveSoundboardCg(rows, new Float32Array(2));
assert.equal(zero.iterations, 0); assert.deepEqual(zero.solution, new Float32Array(2));
assert.throws(() => solveSoundboardCg([[], []], Float32Array.of(1, 1)), /breakdown/);
assert.throws(() => solveSoundboardCg(rows, Float32Array.of(-1, -2), {maxIterations: 1}), /converge/);
const grid = constructSoundboardGrid({sampleRate: 100, method: 1, width: 1, height: 1, propagation: 100,
  stability0: 0.1, stability1: 0, boundary0: 0, boundary1: 0, sourcePosition: 0.5,
  bridge: Float32Array.of(0, 1, 1, 0)});
const matrix = constructSoundboardMatrices(grid, {method: 1, baseScale: 0.1, bridgeScaleAdd: 0, contrast: 1});
assert.equal(matrix.matrixC[0].length, 0);
assert.deepEqual(matrix.matrixC[5].map((e) => e.index), [1, 4, 5, 6, 9]);
assert.equal(matrix.matrixC[5].find((e) => e.index === 5).value, Math.fround(-0.4));
assert.ok(matrix.matrixA[5].find((e) => e.index === 5).value > 0.16);
assert.equal(Math.max(...matrix.shape), 1);
assert.ok(grid.inactive.every((i) => matrix.shape[i] === 0));
const bridge = constructSoundboardMatrices(grid, {method: 1, baseScale: 0.1, bridgeScaleAdd: 0.1, contrast: 1});
assert.equal(bridge.matrixC[9].find((e) => e.index === 9).value, Math.fround(-0.8));
assert.equal(bridge.matrixC[5].find((e) => e.index === 5).value, Math.fround(-0.4));
assert.throws(() => constructSoundboardMatrices(grid, {method: 1, baseScale: 0, bridgeScaleAdd: 0, contrast: 2}), /controls/);
console.log('PASS known CG solution, zero/breakdown/iteration bounds, matrix masking, shape and bridge scaling');
