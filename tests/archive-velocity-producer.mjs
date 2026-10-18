import assert from 'node:assert/strict';
import {archiveVelocityProducerControls} from '../dsp/archive-velocity-producer.mjs';
import {archiveVoicePitchControls} from '../dsp/archive-voice-pitch.mjs';
const curve=(x,y)=>({version:32771,x,y});
const baseFields=[{object_offset:0x168,value:128},{object_offset:0x1788,value:curve([0,1],[2,-2])},
 {object_offset:0x1a80,value:curve([],[-1.5])},{object_offset:0x158,value:0},
 {object_offset:0x2f10,value:{fields:[{object_offset:0xb80,value:curve([],[.002])},{object_offset:0xbd0,value:curve([],[0])}]}}];
const presetFields=[{object_offset:0xc80,value:25},{object_offset:0xc88,value:curve([21,108],[0,12])},
 {object_offset:0x1084,value:0},{object_offset:0x9a8,value:{version:10,scalars:[0,0,0,0,Math.fround(.6)]}}];
const input={baseFields,presetFields,note:69,hostMode:0,host2fe0:0};
const a=archiveVelocityProducerControls(input);
assert.equal(a.curveScale,.5);assert.deepEqual(a.controls.velocityCurve.y,[1,-1]);
assert.equal(a.controls.gC0,-3);assert.equal(a.controls.shared90,.023728057742118835);
const higher=archiveVelocityProducerControls({...input,note:80});
assert(higher.controls.gA0>a.controls.gA0);assert.deepEqual(higher.controls.velocityCurve,a.controls.velocityCurve);
const alter=(o,value)=>presetFields.map(r=>r.object_offset===o?{...r,value}:r);
const capped=archiveVelocityProducerControls({...input,presetFields:alter(0xc80,75)});
assert.equal(capped.curveScale,1);assert.deepEqual(capped.controls.velocityCurve.y,[2,-2]);
const negative=archiveVelocityProducerControls({...input,presetFields:alter(0xc80,-25)});
assert.equal(negative.curveScale,-.5);assert.deepEqual(negative.controls.velocityCurve.y,[-1,1]);
const voice=archiveVoicePitchControls({...input,velocityRuntime:{hostMode:0,host2fe0:0},velocity:.75,
 runtimeCurveMode:'linear-clamp',sourceReferenceDecay:2.7,sampleRate:48000,zeroCentsRuntimeBranchExplicit:true});
assert.equal(voice.velocityProducerControlsFromArchive,true);assert.equal(voice.velocityProducerControlsExplicit,false);
assert.deepEqual(voice.velocityArchive.controls,a.controls);
for(const patch of [{hostMode:1},{host2fe0:NaN},{presetFields:alter(0x1084,1)},
 {presetFields:alter(0x9a8,{version:9,scalars:[0,0,0,0,.3]})},
 {baseFields:baseFields.map(r=>r.object_offset===0x168?{...r,value:1}:r)},
 {baseFields:baseFields.map(r=>r.object_offset===0x1788?{...r,value:{...r.value,version:0}}:r)}])
 assert.throws(()=>archiveVelocityProducerControls({...input,...patch}));
assert.throws(()=>archiveVoicePitchControls({...input,velocityRuntime:{hostMode:0,host2fe0:0},velocityControls:a.controls}));
assert.throws(()=>archiveVoicePitchControls({...input,velocityRuntime:{hostMode:0,host2fe0:0,host78:.5}}));
assert.deepEqual(baseFields[1].value.y,[2,-2]);
console.log('archive velocity producer: passed');
