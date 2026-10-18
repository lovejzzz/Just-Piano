import assert from 'node:assert/strict';
import {archiveVoicePitchControls} from '../dsp/archive-voice-pitch.mjs';
import {DynamicPitchTrajectory} from '../dsp/dynamic-pitch.mjs';
const baseFields=[{object_offset:0x158,value:0},{object_offset:0x2f10,value:{fields:[
 {object_offset:0xb80,value:{x:[21,108],y:[.001,.003]}},
 {object_offset:0xbd0,value:{x:[],y:[.1]}}]}}];
const velocityControls={hostMode:0,host2fe0:0,gA0:30,gC0:-1.5,shared8c:128,shared90:Math.fround(.023728057742118835),sharedMode:0,velocityCurve:{x:[],y:[0]}};
const input={baseFields,note:69,velocity:.5,velocityControls,runtimeCurveMode:'linear-clamp',sourceReferenceDecay:2.75,sampleRate:48000,zeroCentsRuntimeBranchExplicit:true};
const a=archiveVoicePitchControls(input),b=archiveVoicePitchControls({...input,sourceReferenceDecay:3});
assert.equal(a.controls.modalDecay,2.75);assert.equal(b.controls.modalDecay,3);
assert.equal(a.controls.velocityScale,b.controls.velocityScale);assert.equal(a.controls.strength,b.controls.strength);
assert.equal(a.referenceDecayFromOwnSource,true);
const faster=archiveVoicePitchControls({...input,velocity:.8});assert(faster.controls.velocityScale>a.controls.velocityScale);
const higherNote=archiveVoicePitchControls({...input,note:70});assert(higherNote.controls.strength>a.controls.strength);
const va=new DynamicPitchTrajectory(a.controls),vb=new DynamicPitchTrajectory(b.controls);
va.next(64);vb.next(64);assert.notEqual(va.next(64).pitch,vb.next(64).pitch);
for(const change of [{velocity:NaN},{velocity:-1},{sampleRate:0},{sourceReferenceDecay:0},{sourceReferenceDecay:1e-100},{sampleRate:1e-40},{runtimeCurveMode:'guess'},{zeroCentsRuntimeBranchExplicit:false},
 {velocityControls:{...velocityControls,host78:.5}},{velocityControls:{...velocityControls,host80:.3}},{velocityControls:{...velocityControls,sharedMode:1}},
 {baseFields:[{object_offset:0x158,value:1},baseFields[1]]}])assert.throws(()=>archiveVoicePitchControls({...input,...change}));
assert.deepEqual(velocityControls.velocityCurve,{x:[],y:[0]});
console.log('archive voice pitch: passed');
