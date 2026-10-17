import assert from 'node:assert/strict';
import {applyHammerAllHardness,clampHammerHardnessTable} from '../dsp/hammer-all-hardness.mjs';
const groups=[0.5,1,1.5];
assert.deepEqual(applyHammerAllHardness(groups,0),groups);
assert.deepEqual(applyHammerAllHardness(groups,-1),[0,0,0]);
assert.deepEqual(applyHammerAllHardness(groups,-0.5),[0.25,0.5,0.75]);
assert.deepEqual(applyHammerAllHardness(groups,0.5),[0.75,1.5,2]);
assert.deepEqual(applyHammerAllHardness(groups,0.75),[1.4375,1.875,2]);
assert.deepEqual(applyHammerAllHardness(groups,1),[2,2,2]);
assert.deepEqual(applyHammerAllHardness(groups,2),[2,2,2]);
assert.deepEqual(applyHammerAllHardness([3,-1,2],0),[3,-1,2]); // final products clamp separately
assert.deepEqual(clampHammerHardnessTable([-1,-0,0.5,2,3]),[0,-0,0.5,2,2]);
assert.throws(()=>applyHammerAllHardness([1,2],0));
assert.throws(()=>applyHammerAllHardness([1,NaN,2],0));
assert.throws(()=>applyHammerAllHardness(groups,Infinity));
assert.throws(()=>clampHammerHardnessTable([0,0,0,0,Number.MAX_VALUE]));
console.log('All hardness arithmetic branch fixtures and final product clamps passed; no native nonzero-All voice coverage claimed.');
