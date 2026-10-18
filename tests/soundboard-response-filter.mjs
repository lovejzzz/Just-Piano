import assert from 'node:assert/strict';
import {filterSoundboardResponses} from '../dsp/soundboard-response-filter.mjs';
const base = {sampleRate: 8, cutoff: 0, adjustmentNumerator: 2, adjustmentDenominator: 1,
  channels: [{identity: 4, kind: 0, flag: 0}, {identity: 4, kind: 0, flag: 1}]};
const a = Float32Array.of(1, 2, 3);
const b = Float32Array.of(2, 1, 5);
const result = filterSoundboardResponses([a, b], base);
assert.equal(result.feedback, -1);
assert.equal(result.feed, 0.125);
assert.deepEqual(Array.from(result.outputs[0]), [1, 2, 3]);
assert.deepEqual(Array.from(result.outputs[1]), [0.25, 0, 0.5]);
assert.deepEqual(result.referenceIndices, [null, 0]);
assert.deepEqual(Array.from(b), [2, 1, 5]);
const bypassCorrection = filterSoundboardResponses([Float32Array.of(2, 4)], {
  ...base, adjustmentDenominator: 0, channels: [{identity: 1, kind: 1, flag: 1}],
});
assert.deepEqual(Array.from(bypassCorrection.outputs[0]), [0.25, 0.75]);
assert.throws(() => filterSoundboardResponses([a, b], {...base,
  channels: [base.channels[0], {...base.channels[1], identity: 5}]}), /reference/);
assert.throws(() => filterSoundboardResponses([a], base), /metadata/);
assert.throws(() => filterSoundboardResponses([a, b], {...base, sampleRate: 0}), /controls/);
console.log('PASS soundboard paired correction, selective filter and metadata guards');
