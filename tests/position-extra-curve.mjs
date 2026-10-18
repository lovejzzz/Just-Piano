import assert from 'node:assert/strict';
import {positionExtraCurve} from '../dsp/position-extra-curve.mjs';
import {modalPositionWeights} from '../dsp/modal-position-weights.mjs';
const c={x:[100,200,500],y:[0,1,4]};
assert.equal(positionExtraCurve(c,50),0);assert.equal(positionExtraCurve(c,100),0);assert.equal(positionExtraCurve(c,200),1);assert.equal(positionExtraCurve(c,500),4);assert.equal(positionExtraCurve(c,1000),4);assert.equal(positionExtraCurve(c,350),2.5);
assert.equal(positionExtraCurve({x:[],y:[2]},100),2);
assert.throws(()=>positionExtraCurve({x:[1,1],y:[1,2]},1),/Increasing/);
assert.throws(()=>positionExtraCurve({x:[1,2],y:[1]},1),RangeError);
const input={frequency:[100,200,300,400],indexStorage:[0,10,0,0],layout:[[0,4,4,2]],position:0,referenceFrequency:440,rolloff:4000,cutoffIndex:1,extraCurve:c};
const own=modalPositionWeights(input);
// The additional curve applies to valid lanes after the cutoff mask, not padding.
assert.equal(own[1],1);
const zero=modalPositionWeights({...input,extraCurve:{x:[],y:[0]}});
assert.equal(own[2],zero[2]);assert.equal(own[3],zero[3]);
assert.throws(()=>modalPositionWeights({...input,extraCurve:undefined}),/Extra position curve/);
assert.doesNotThrow(()=>modalPositionWeights({...input,position:.125,extraCurve:undefined}));
console.log('position extra curve: passed');
