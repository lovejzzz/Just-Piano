import assert from 'node:assert/strict';
import {voiceHeaderRatios,archiveFixedVoiceHeaderRatios} from '../dsp/voice-header-ratios.mjs';
const ratio=(initialSpread,currentSpread,initialImpedance=2,currentImpedance=4)=>voiceHeaderRatios({initialSpread,currentSpread,initialImpedance,currentImpedance});
assert.deepEqual(ratio(1,2),{adjustmentRatio:2,decayScale:0.5});
assert.equal(ratio(2,1).adjustmentRatio,0.5);
// Native equal-control branch precedes the small-control limiting branch.
assert.equal(ratio(0,0).adjustmentRatio,1);
assert.equal(ratio(0.125,0.25).adjustmentRatio,0.625);
assert.equal(ratio(0.5,1).adjustmentRatio,2);
assert.equal(ratio(0.125,0.0625).adjustmentRatio,0.5);
assert.equal(ratio(-1,0.001).adjustmentRatio,1);
const fields=[{object_offset:0x470,value:{a:Math.fround(1.2)}},
 {object_offset:0x588,value:{scalars:[Math.fround(1.1),9,10]}},
 {object_offset:0x1518,value:[2,3,4,6]}];
const input={presetFields:fields,systemExclusiveCount:0,events:[{channel:0,kind:'controlChange',controller:64},{channel:0,kind:'noteOn'}]};
const own=archiveFixedVoiceHeaderRatios(input);
assert.equal(own.adjustmentRatio,1);assert.equal(own.decayScale,1);
assert.equal(own.header.initialImpedance,Math.fround(1.1));
fields[0].value.a=9;assert.notEqual(own.header.initialSpread,9);
for(const patch of [{systemExclusiveCount:1},{systemExclusiveCount:undefined},{events:[]},
 {events:[{channel:0,kind:'other'}]}, {events:[{channel:1,kind:'noteOn'}]},
 {events:[{channel:0,kind:'controlChange',controller:1}]}])
 assert.throws(()=>archiveFixedVoiceHeaderRatios({...input,...patch}));
for(const bad of [NaN,Infinity,1e100])assert.throws(()=>ratio(bad,1));
assert.throws(()=>ratio(1,1,0,1));assert.throws(()=>ratio(1,1,1,0));
console.log('Header ratio limiting/equality branches, reciprocal direction, archive initialization and unsupported-event guards passed');
