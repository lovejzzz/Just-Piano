import assert from 'node:assert/strict';
import {ModalRefreshPolicy} from '../dsp/modal-refresh-policy.mjs';
const policy=new ModalRefreshPolicy();
const next=(counter,values={})=>policy.next({counter,logicalModeCount:12,gain:0,rate:0,pitchApplied:false,...values});
assert.equal(next(0).required,true);
assert.equal(next(64).required,false);
assert.equal(next(128,{gain:.125,rate:.25}).required,true);
assert.equal(next(192,{gain:.125,rate:.25}).required,true); // Same gain still changes energy-dependent normalization.
assert.equal(next(256).required,true); // Clear old gain/coefficient contribution once.
assert.equal(next(320).required,false);
assert.equal(next(384,{pitchApplied:true}).required,true);
assert.equal(next(448,{positionWarmupDue:true}).required,true);
assert.equal(next(512,{rate:.25}).required,true);
assert.equal(next(576,{rate:.25}).required,false);
assert.equal(next(640,{logicalModeCount:0,gain:1,rate:2,pitchApplied:true,positionWarmupDue:true}).required,false);
assert.equal(next(704,{gain:1,rate:2}).required,true);
assert.equal(policy.summary().nativeRefreshDecisionUsedForPrediction,false);
assert.throws(()=>next(832));
assert.throws(()=>next(768,{gain:NaN}));
assert.throws(()=>next(768,{logicalModeCount:4097}));
assert.throws(()=>next(768,{pitchApplied:1}));
assert.equal(next(768,{gain:-0,rate:0}).required,true);
assert.equal(next(832,{gain:+0,rate:-0}).required,false); // Native FCMP equates signed zeros.
console.log('Own modal refresh: initial, held damping, gain/rate transitions, pitch/warmup, empty modes, clock and signed-zero guards passed');
