import assert from 'node:assert/strict';
import {readFormatZeroNoteOns,prepareNoteOnVelocitySource,computeNoteOnVelocitySource} from '../scripts/pianoteq_note_on_velocity_source.mjs';
const midi = track => {
  const h=Buffer.from('4d546864000000060000000101e04d54726b00000000','hex');
  h.writeUInt32BE(track.length,18);return Buffer.concat([h,Buffer.from(track)]);
};
// Multi-byte delta, running status, velocity-zero note-off and complete meta skip.
const parsed=readFormatZeroNoteOns(midi([0x81,0,0x90,69,96, 1,69,0,
  0,0xff,1,3,65,66,67, 2,0x90,70,40, 0,0xff,0x2f,0]));
assert.deepEqual(parsed.events,[{ticks:128,channel:0,note:69,velocity:96},{ticks:131,channel:0,note:70,velocity:40}]);
assert.throws(()=>readFormatZeroNoteOns(midi([0,69,96,0,0xff,0x2f,0])));
assert.throws(()=>readFormatZeroNoteOns(midi([0,0xff,1,4,65])));
assert.throws(()=>readFormatZeroNoteOns(midi([0,0xff,0x2f,0,0])));
const id={x:[0,1],y:[0,1]}, zero={x:[],y:[0]};
const base={fields:[{object_offset:0x6d8,value:id},{object_offset:0x728,value:id}]};
const preset={decoded_tail:{fields:[
  ...[0xd88,0xdd8,0xe28,0xe78].map(object_offset=>({object_offset,value:id})),
  {object_offset:0xf20,value:0},{object_offset:0xec8,value:0},{object_offset:0xed0,value:zero},
]}};
const track=[0,0x90,69,96,...Array.from({length:4},()=>[1,69,96]).flat(),0,0xff,0x2f,0];
const source=prepareNoteOnVelocitySource(midi(track),base,preset);
assert.equal(source.events.length,5);
assert.equal(source.managerDraws,10);
assert.deepEqual(source.events.map(e=>e.ticks),[0,1,2,3,4]);
assert.deepEqual(computeNoteOnVelocitySource(source.source).events,source.events);
const damaged=structuredClone(source.source);damaged.curves.base.noteOn.y[1]=0.9;
assert.throws(()=>computeNoteOnVelocitySource(damaged),/digest mismatch/);
assert.throws(()=>computeNoteOnVelocitySource({...source.source,postLookupShaping:0.1}));
assert.throws(()=>computeNoteOnVelocitySource({...source.source,conditions:{...source.source.conditions,newlyObserved:true}}));
console.log('MIDI parser boundaries, explicit velocity reconstruction and source corruption guards passed.');
