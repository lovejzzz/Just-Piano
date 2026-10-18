import assert from 'node:assert/strict';
import {soundboardIrWeights} from '../dsp/soundboard-ir-window.mjs';

const five = soundboardIrWeights(5);
assert.deepEqual(Array.from(five.subarray(0, 3)), [1, 1, 1]);
assert.deepEqual(Array.from(five.subarray(3)), [1, 0]);

const ten = soundboardIrWeights(10);
assert.deepEqual(Array.from(ten.subarray(0, 7)), Array(7).fill(1));
assert.equal(ten[7], 1);
assert.equal(ten[8], 0.5);
assert.equal(ten[9], 0);

const long = soundboardIrWeights(100);
assert.equal(long.length, 100);
assert.equal(long[79], 1);
assert.equal(long[99], 0);
assert.ok(long.subarray(79).every((value, index, values) =>
  index === 0 || value <= values[index - 1]));
assert.throws(() => soundboardIrWeights(4), /length >= 5/);
assert.throws(() => soundboardIrWeights(5.5), /Integer/);

console.log('PASS soundboard IR quintic taper and guards');
