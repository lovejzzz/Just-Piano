import assert from 'node:assert/strict';
import {
  normalizeSoundboardRows,
  soundboardSparseDifference,
  soundboardSparseMultiply,
} from '../dsp/soundboard-sparse.mjs';

const rows = normalizeSoundboardRows([
  {row: 0, entries: [{indexLow: 0, indexHigh: 0, valueLow: 2, valueHigh: 0}]},
  {row: 1, entries: [
    {indexLow: 0, indexHigh: 0, valueLow: -1, valueHigh: 0},
    {indexLow: 1, indexHigh: 0, valueLow: 3, valueHigh: 0},
  ]},
], 2);
assert.deepEqual(soundboardSparseMultiply(rows, Float32Array.from([4, 5])), Float32Array.from([8, 11]));
assert.deepEqual(
  soundboardSparseDifference(rows, Float32Array.from([4, 5]), Float32Array.from([1, 2])),
  Float32Array.from([6, 6]),
);
assert.throws(() => normalizeSoundboardRows([{row: 0, entries: []}], 2), /row count/);
assert.throws(() => normalizeSoundboardRows([
  {row: 0, entries: [{indexLow: 2, indexHigh: 0, valueLow: 1, valueHigh: 0}]},
  {row: 1, entries: []},
], 2), /out of range/);
assert.throws(() => normalizeSoundboardRows([
  {row: 0, entries: [
    {indexLow: 0, indexHigh: 0, valueLow: 1, valueHigh: 0},
    {indexLow: 0, indexHigh: 0, valueLow: 2, valueHigh: 0},
  ]},
  {row: 1, entries: []},
], 2), /duplicate/);
assert.throws(() => normalizeSoundboardRows([
  {row: 0, entries: [{indexLow: 0, indexHigh: 1, valueLow: 1, valueHigh: 0}]},
  {row: 1, entries: []},
], 2), /high index/);
assert.throws(() => soundboardSparseMultiply(rows, Float32Array.from([1])), /width differs/);

console.log('PASS soundboard sparse rows, float32 multiply, difference and guards');
