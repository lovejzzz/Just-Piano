import assert from 'node:assert/strict';
import {prepareArchiveHardnessSource,computeArchiveHardnessSource} from '../scripts/pianoteq_archive_hardness_source.mjs';
const constant=v=>({x:[],y:Array.isArray(v)?v:[v]});
const base={fields:[{object_offset:0xde8,value:constant([0.1,0.3,0.5,0.7,0.9])},
  ...[0xc58,0xe38].flatMap((start,j)=>Array.from({length:5},(_,i)=>({object_offset:start+i*0x50,value:constant((i+1)*(j+1)/32)})))
]};
const compound={scalars:[0,2,3,4,0],curves:[constant(1),constant(0.5),constant(2),constant(0.25)],s10:0,curve170:constant(0)};
const preset={decoded_tail:{fields:[{object_offset:0x9a8,value:compound}]}};
const own=prepareArchiveHardnessSource(base,preset);
assert.deepEqual(own.curves.primary.values,[0.03125,0.0625,0.5625,0.125,0.15625]);
assert.deepEqual(own.curves.secondary.values,[0.0625,0.125,1.125,0.25,0.3125]);
const saturated=structuredClone(base);saturated.fields[1].value.y[0]=100;
assert.equal(prepareArchiveHardnessSource(saturated,preset).curves.primary.values[0],2);
assert.deepEqual(computeArchiveHardnessSource(own.source).curves,own.curves);
const damaged=structuredClone(own.source);damaged.fields.presetFields[0].value.scalars[1]=1;
assert.throws(()=>computeArchiveHardnessSource(damaged),/digest/);
assert.throws(()=>computeArchiveHardnessSource({...own.source,note:68}));
assert.throws(()=>prepareArchiveHardnessSource({fields:base.fields.slice(1)},preset));
const unsupported=structuredClone(preset);unsupported.decoded_tail.fields[0].value.s10=0.1;
assert.throws(()=>prepareArchiveHardnessSource(base,unsupported),/Nonzero All/);
console.log('Archive hardness source produces grouped tables and rejects corrupt or unsupported branches.');
