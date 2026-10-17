import assert from 'node:assert/strict';
import {archiveTerminalVoiceModel,terminalSlopesFromDecayRow} from '../dsp/archive-terminal-model.mjs';
// Synthetic branch checks; authentic source rows and audio are validated separately.
const fields=[{object_offset:0x10a8,kind:'u32',value:0},{object_offset:0x1334,kind:'f32',value:1},{object_offset:0x1338,kind:'curve',value:{}},{object_offset:0x1398,kind:'f32',value:0},{object_offset:0x139c,kind:'u32',value:0},{object_offset:0x45c,kind:'u32',value:0}];
const archive={editFields:fields,baseFields:[{object_offset:0x1c10,kind:'vf',value:Array(113).fill(.5)}]};
const modelSources={columns:3,rows:1,selectedRow:0,decayRow:[4,2,7],referenceFrequency:440,instrumentDurationFlag:0,durationTarget:999};
const make=(changes={},note=69)=>archiveTerminalVoiceModel({archive,note,modelSources:{...modelSources,...changes}});
const base=make();assert.equal(base.primary.slope,2);assert.equal(base.primary.scale,.5);assert.equal(base.secondary.slope,0);assert.equal(base.secondary.scale,.5);
assert.deepEqual(make({durationTarget:-99}),base); // Native target cannot seed the prediction.
assert.equal(make({decayRow:[.1,4,3]}).primary.slope,1);
assert.equal(make({rows:0,columns:0,decayRow:[]}).primary.slope,1);
assert.equal(make({referenceFrequency:2}).duration,1);
assert.equal(make({referenceFrequency:-1}).frequencyFloor,0);
assert.equal(make({instrumentDurationFlag:1},21).duration,Math.fround(2.1));
assert.equal(make({instrumentDurationFlag:1},60).duration,Math.fround(.84));
assert.throws(()=>make({decayRow:[]}),/Complete selected/);
assert.throws(()=>make({selectedRow:1}),/Complete selected/);
assert.throws(()=>make({referenceFrequency:NaN}),/Finite terminal/);
assert.throws(()=>terminalSlopesFromDecayRow({columns:1,rows:1,selectedRow:0,decayRow:[1e40]}),/Finite terminal decay/);
console.log('PASS synthetic: decay-row minimum/floor, duration frequency floor, instrument boundary constants, target independence and malformed-source rejection');
