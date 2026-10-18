import assert from 'node:assert/strict';
import {MidiRawNodeVelocities} from '../dsp/midi-raw-node-velocities.mjs';
const curve=y=>({x:[0,1],y}),identity=curve([0,1]);
const baseFields=[{object_offset:0x6d8,value:identity},{object_offset:0x728,value:identity},
 {object_offset:0x2f10,kind:'mar_param',value:{fields:[
  {object_offset:0xd18,kind:'c',value:curve([.01,.01])},{object_offset:0xd68,kind:'c',value:curve([60,60])},
  {object_offset:0xdb8,kind:'c',value:curve([1,1])}]}}];
const presetFields=[0xd88,0xe28,0xe78].map(object_offset=>({object_offset,value:identity}));
presetFields.push({object_offset:0xdd8,value:curve([1,1])},{object_offset:0xf20,value:0},{object_offset:0x1518,value:[2,3,4,6]});
const initial={keys:[{nodes:[{object:'fallback',velocity:-100,id:7,tag:0}]}]};
const config={baseFields,presetFields,keyIndex:0,eventClock:{sampleRate:48000,blockSize:64,events:[
 {kind:'noteOn',frame:640,note:69,channel:0,velocity:96},{kind:'noteOff',frame:1280,note:69,channel:0,velocity:0},
 {kind:'noteOn',frame:1920,note:69,channel:0,velocity:96}]}};
const own=new MidiRawNodeVelocities(initial,config);
assert.equal(own.velocitiesFor(initial,0).get('fallback'),-100);
const snapshot={keys:[{nodes:[{object:'played',id:0,tag:0,velocity:NaN},...initial.keys[0].nodes]}]};
assert.equal(own.velocitiesFor(snapshot,640).get('played'),Math.fround(1e10));
assert.ok(own.velocitiesFor(snapshot,1280).get('played')<0);
assert.equal(own.velocitiesFor(snapshot,1920).get('played'),Math.fround(1e10));
snapshot.keys[0].nodes[0].velocity=123; // Native dynamic velocity never enters prediction.
assert.equal(own.velocitiesFor(snapshot,640).get('played'),Math.fround(1e10));
assert.throws(()=>new MidiRawNodeVelocities(initial,config).velocitiesFor(snapshot,576));
assert.throws(()=>own.velocitiesFor({keys:[{nodes:[{object:'other',id:0,tag:0}]}]},1920));
assert.throws(()=>own.velocitiesFor({keys:[{nodes:[{object:'fallback',id:0,tag:0}]}]},1920));
console.log('MIDI raw-node held/released/retriggered velocities, ignored runtime velocity, birth and identity guards passed (synthetic).');
