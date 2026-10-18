import assert from 'node:assert/strict';
import {sampleExcitationExtraCurve} from '../dsp/archive-excitation-extra-tables.mjs';
const curve = (x, y) => ({x, y, dimension: 1, log_x: 0, special_mode: 0});
// Boundary mode 0 must not clamp a multi-node curve outside its support.
assert.deepEqual(sampleExcitationExtraCurve(curve([1.5, 2.5], [2, 4])), [0, 3]);
// The native one-node fast path extends the value to the right.
assert.deepEqual(sampleExcitationExtraCurve(curve([1.5], [4])), [0, 4]);
assert.deepEqual(sampleExcitationExtraCurve(curve([1, 2, 3], [2, 0, 0])), [2]);
assert.deepEqual(sampleExcitationExtraCurve(curve([1, 2], [0, 0])), []);
assert.deepEqual(sampleExcitationExtraCurve(curve([1, 2], [2, -0])), [2]);
for (const bad of [curve([1, 1], [1, 2]), curve([1, 1000], [1, 2]),
  curve([], []), curve([1], [1e100]), {...curve([1], [1]), dimension: 2}])
  assert.throws(() => sampleExcitationExtraCurve(bad));
console.log('Extra spectrum boundary, suffix and invalid-input checks passed');
