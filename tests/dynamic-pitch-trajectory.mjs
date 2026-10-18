import assert from 'node:assert/strict';
import {DynamicPitchTrajectory,dynamicPitchStep} from '../dsp/dynamic-pitch.mjs';
import {nativeScalarExp2f} from '../dsp/native-scalar-exp.mjs';
const controls={timestep:Math.fround(1/48000),centsA:0,centsB:0,strength:0.0018125000642612576,
 velocityScale:0.29713115096092224,modalDecay:2.721482038497925,relaxation:0,
 exponentialBranch:true,released:false,releaseRule:false,damperFlag:false,releaseAmount:0,smoothedRatio:1};
const input={...controls},v=new DynamicPitchTrajectory(input);input.strength=10;
assert.equal(v.next(64).pitch,1.0001599788665771);
assert.equal(v.next(64).pitch,1.0001589059829712);
for(let i=2;i<128;i++){
 const own=v.next(64),reference=dynamicPitchStep({...controls,sampleAge:i*64},{disabled:false});
 assert.equal(own.counter,i*64);assert.equal(own.pitch,reference.pitch);
}
assert.equal(v.counter,8192);
// The latch belongs to the runtime and remains set after the correction dies.
const tail=new DynamicPitchTrajectory({...controls,modalDecay:100});
let latched=false;
for(let i=0;i<128;i++){const r=tail.next(64);if(r.disabled)latched=true;if(latched){assert.equal(r.pitch,1);assert.equal(r.disabled,true);}}
assert.equal(latched,true);
const cents=new DynamicPitchTrajectory({...controls,strength:0,centsA:12});
assert.equal(cents.next(64).pitch,nativeScalarExp2f(Math.fround(Math.fround(12)*Math.fround(1/1200))));
assert.throws(()=>v.next(0),RangeError);assert.throws(()=>v.next(.5),RangeError);
assert.throws(()=>v.next(0xffffffff),RangeError);
assert.throws(()=>new DynamicPitchTrajectory({...controls,timestep:0}),RangeError);
console.log('dynamic pitch trajectory: passed');
