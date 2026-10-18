import assert from 'node:assert/strict';
import {constructSoundboardFamilyPolicy as construct} from '../dsp/soundboard-family-policy.mjs';
const fixture = () => ({soundboards: {filters: [{mode: 1}, {mode: 1}]},
  modelFeatures: {rootType: 1, rootLidEnabled: false}, microphones: {output: {extra: [1.25, -3]}}});
assert.deepEqual(construct(fixture()), {modelFamily: 1, rootType: 1, uprightRoot: true,
  rootLidEnabled: false, verticalOffset: 1.25, levelDb: -3});
const ordinary = {soundboards: {filters: [{mode: 0}]}, modelFeatures: {}};
assert.equal(construct(ordinary).uprightRoot, false);
assert.equal(construct(ordinary).rootLidEnabled, null);
for (const change of [a => delete a.modelFeatures.rootType, a => a.soundboards.filters[1].mode = 0,
  a => a.soundboards.filters[0].mode = 2, a => a.microphones.output.extra.pop(),
  a => a.microphones.output.extra[0] = NaN, a => a.microphones.output.extra[1] = 1e100,
  a => a.modelFeatures.rootLidEnabled = 1]) {
  const a = fixture(); change(a); assert.throws(() => construct(a), RangeError);
}
const other = fixture(); other.modelFeatures.rootType = 2;
assert.equal(construct(other).uprightRoot, false);
assert.equal(construct(other).verticalOffset, 0);
console.log('archive family/root selection, upright fields, explicit lid and unsupported scope guards passed');
