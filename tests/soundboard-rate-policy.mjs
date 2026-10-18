import assert from 'node:assert/strict';
import {constructSoundboardRatePolicy as choose,soundboardRateRatios} from '../dsp/soundboard-rate-policy.mjs';
for(const renderRate of [44100,48000,96000,88200,192000]){
 const result=choose({baseRate:44100,renderRate});
 assert.equal(result.outputRate,[44100,88200].includes(renderRate)?44100:48000);
}
// Exact ties retain the first table entry, including the non-unit 3/2 entry.
assert.equal(choose({baseRate:40000,renderRate:50000}).selectedRatio,0);
assert.equal(choose({baseRate:40000,renderRate:70000}).selectedRatio,1);
assert.equal(choose({baseRate:40000,renderRate:70001}).selectedRatio,2);
for(let i=0;i<soundboardRateRatios.length;i++){
 const [n,d]=soundboardRateRatios[i],result=choose({baseRate:24000,renderRate:24000*n/d});
 assert.equal(result.selectedRatio,i);assert.equal(result.outputRate,24000);
}
for(const args of [{baseRate:0,renderRate:48000},{baseRate:44100,renderRate:NaN},
 {baseRate:44100,renderRate:Infinity},{baseRate:44100,renderRate:-1},{baseRate:44100.5,renderRate:48000}])assert.throws(()=>choose(args),RangeError);
console.log('soundboard rate policy: ratio branches, ties and finite input guards passed');
