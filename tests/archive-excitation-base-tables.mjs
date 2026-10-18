import assert from 'node:assert/strict';
import {interpolateBaseSpectrum} from '../dsp/archive-excitation-base-tables.mjs';
const f = Math.fround;
// This interval distinguishes direct division from a cached float reciprocal.
assert.equal(interpolateBaseSpectrum([0, 10], [0, 1], 9), f(9 / 10));
assert.notEqual(interpolateBaseSpectrum([0, 10], [0, 1], 9), f(9 * f(1 / 10)));
assert.equal(interpolateBaseSpectrum([1, 2], [3, 4], 0), 3);
assert.equal(interpolateBaseSpectrum([1, 2], [3, 4], 3), 4);
assert.equal(interpolateBaseSpectrum([1], [3], 100), 3);
assert.equal(interpolateBaseSpectrum([1, 1, 2], [3, 5, 7], 1), 3);
assert.equal(interpolateBaseSpectrum([1, 1, 2], [3, 5, 7], 1.5), 6);
for (const args of [[[], [], 1], [[2, 1], [3, 4], 1], [[1], [Infinity], 1], [[1], [1e100], 1]])
  assert.throws(() => interpolateBaseSpectrum(...args));
console.log('Base spectrum division, boundaries and invalid-grid checks passed');
