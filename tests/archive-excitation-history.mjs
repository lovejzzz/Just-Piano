import assert from 'node:assert/strict';
import {archiveHistoryCurve} from '../dsp/archive-excitation-history.mjs';
const curve = (x, y) => ({version: 32771, x, y, indices: []});
const list = {version: 1, coordinates: [60, 72], curves: [curve([0, 2], [1, 3]), curve([1, 3], [2, 4])]};
const before = JSON.stringify(list), mixed = archiveHistoryCurve(list, 66);
assert.deepEqual(mixed.x, [0, 1, 2, 3]);
assert.deepEqual(mixed.y, [1.5, 2, 3, 3.5]);
assert.deepEqual(mixed.selection, {left: 0, right: 1, fraction: .5});
assert.deepEqual(archiveHistoryCurve(list, 21).y, [1, 3]);
assert.deepEqual(archiveHistoryCurve(list, 108).y, [2, 4]);
assert.deepEqual(archiveHistoryCurve(list, 60).x, [0, 2]);
assert.deepEqual(archiveHistoryCurve(list, 72).x, [1, 3]);
assert.equal(JSON.stringify(list), before);
const sameX = {version: 1, coordinates: [60, 72], curves: [curve([0, 1], [0, 2]), curve([0, 1], [2, 4])]};
assert.deepEqual(archiveHistoryCurve(sameX, 66).x, [0, 1]);
assert.deepEqual(archiveHistoryCurve(sameX, 66).y, [1, 3]);
for (const bad of [
  {...list, coordinates: [60, 60]}, {...list, version: 0},
  {...list, curves: [curve([0, 2], [1, 3]), curve([1, 1], [2, 4])]},
  {...list, curves: [curve([0, 2], [1, 3]), curve([1, 3], [2])]},
  {...list, curves: [curve([], [1]), curve([1, 3], [2, 4])]},
]) assert.throws(() => archiveHistoryCurve(bad, 66));
console.log('History curve union, endpoint clamps, interpolation, source immutability and invalid inputs passed (synthetic; not native audio).');
