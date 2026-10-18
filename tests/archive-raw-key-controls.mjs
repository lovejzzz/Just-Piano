import assert from 'node:assert/strict';
import {archiveRawKeyControls,archiveRawHostDamperControls} from '../dsp/archive-raw-key-controls.mjs';
const curve=(x,y)=>({version:32771,x,y});
const baseFields=[{object_offset:0x2f10,kind:'mar_param',value:{fields:[
 {object_offset:0xe08,kind:'u',value:91},
 {object_offset:0xc78,kind:'c',value:curve([21,69,108],[.7,.5,.3])}
]}}];
const presetFields=[{object_offset:0x1168,kind:'f32',value:91},
 {object_offset:0x1170,kind:'curve',value:curve([0,127],[0,1])}];
const at=(note,b=baseFields,a=presetFields)=>archiveRawKeyControls({baseFields:b,presetFields:a,note});
assert.equal(at(91).flags[0],1);assert.equal(at(92).flags[0],0);
assert.equal(at(69).localSoftControl,Math.fround(.5));assert.equal(at(127).localControl,1);assert.equal(at(0).localControl,0);
const fallback=structuredClone(presetFields);fallback[0].value=-1;
assert.deepEqual(at(69,baseFields,fallback),at(69));
const changedBase=structuredClone(baseFields);changedBase[0].value.fields[0].value=68;
assert.equal(at(69,changedBase,fallback).flags[0],0);assert.equal(at(69,changedBase).flags[0],1);
const edited=structuredClone(presetFields);edited[0].value=68;
assert.equal(at(69,baseFields,edited).flags[0],0);
const badCurve=structuredClone(baseFields);badCurve[0].value.fields[1].value.version=32772;
assert.throws(()=>at(69,badCurve));assert.throws(()=>at(69.5));assert.throws(()=>at(69,[],presetFields));
assert.throws(()=>at(69,baseFields,[...presetFields,presetFields[0]]));
const badLimit=structuredClone(baseFields);badLimit[0].value.fields[0].value=-1;
assert.throws(()=>at(69,badLimit));
console.log('Archive key damper boundary/override/fallback, ordinary local curves and invalid-source guards passed (synthetic).');

const hostBase=structuredClone(baseFields),hostPreset=structuredClone(presetFields);
hostBase[0].value.fields.push({object_offset:0xc70,kind:'f',value:.5});
hostPreset.push({object_offset:0x116c,kind:'f32',value:0});
assert.deepEqual(archiveRawHostDamperControls({baseFields:hostBase,presetFields:hostPreset}),{hostControl:0,hostBlend:.5});
hostBase[0].value.fields.find(r=>r.object_offset===0xc70).value=.25;
hostPreset.find(r=>r.object_offset===0x116c).value=.75;
assert.deepEqual(archiveRawHostDamperControls({baseFields:hostBase,presetFields:hostPreset}),{hostControl:.75,hostBlend:.25});
hostPreset.find(r=>r.object_offset===0x116c).value=NaN;
assert.throws(()=>archiveRawHostDamperControls({baseFields:hostBase,presetFields:hostPreset}));
console.log('Archive host damper controls, source changes and finite-input guards passed (synthetic).');
