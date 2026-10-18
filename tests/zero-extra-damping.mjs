import assert from 'node:assert/strict';
import {archiveZeroExtraDamping,initializeZeroExtraDamping} from '../dsp/zero-extra-damping.mjs';
const curve=(x,y)=>({version:32771,x,y,indices:[]});
const input={note:69,baseFields:[{object_offset:0x38f8,value:curve([36,84],[0,.5,1,0,.5,1])}],
 presetFields:[{object_offset:0x7d8,value:0},{object_offset:0x7e0,value:curve([36,84],[0,0])},
 {object_offset:0x880,value:{integers:[0,0]}}]};
const p=archiveZeroExtraDamping(input);
for(const v of [0,.25,.5,.75,1]){const own=initializeZeroExtraDamping(p,v);assert.equal(own.extraGain,0);assert.equal(own.velocityValue,v);}
const edited=structuredClone(input);edited.presetFields[0].value=.1;assert.throws(()=>archiveZeroExtraDamping(edited),/Nonzero/);
const randomized=structuredClone(input);randomized.presetFields[2].value.integers[0]=1;assert.throws(()=>archiveZeroExtraDamping(randomized),/randomized/);
const negative=structuredClone(input);negative.presetFields[0].value=-1;assert.equal(archiveZeroExtraDamping(negative).gain,0);
assert.throws(()=>initializeZeroExtraDamping(p,1.1));assert.throws(()=>initializeZeroExtraDamping(p,NaN));
console.log('Archive zero source, velocity interpolation, clamped negative source and nonzero/randomized rejection passed');
