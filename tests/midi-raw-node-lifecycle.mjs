import assert from 'node:assert/strict';
import {MidiRawNodeLifecycle,rawNodeCanRetire} from '../dsp/midi-raw-node-lifecycle.mjs';
import {GlobalRawKeys} from '../dsp/global-raw-keys.mjs';
const curve=y=>({x:[0,1],y}),identity=curve([0,1]);
const baseFields=[{object_offset:0x6d8,value:identity},{object_offset:0x728,value:identity},
 {object_offset:0x2f10,kind:'mar_param',value:{fields:[
  {object_offset:0xd18,kind:'c',value:curve([.01,.01])},{object_offset:0xd68,kind:'c',value:curve([60,60])},
  {object_offset:0xdb8,kind:'c',value:curve([1,1])}]}}];
const presetFields=[0xd88,0xe28,0xe78].map(object_offset=>({object_offset,value:identity}));
presetFields.push({object_offset:0xdd8,value:curve([1,1])},{object_offset:0xf20,value:0},{object_offset:0x1518,value:[2,3,4,6]});

const initial={samples:64,sampleRate:48000,hostControl:0,hostBlend:.5,softControl:0,pedalControl:0,binaryPedal:0,bypassFlags:[0,0],keys:[{flags:[1,0,0],localControl:0,localSoftControl:0,nodes:[{object:'native-initial',id:7,tag:0,velocity:-100,position:0,intermediate:0}]}]};
const config={baseFields,presetFields,keyIndex:0,eventClock:{sampleRate:48000,blockSize:64,events:[
 {kind:'noteOn',frame:640,note:69,channel:0,velocity:96},{kind:'noteOff',frame:1280,note:69,channel:0,velocity:0},
 {kind:'noteOn',frame:1920,note:69,channel:0,velocity:96}]}};
const driver=new MidiRawNodeLifecycle(initial,config),raw=new GlobalRawKeys(driver.initialState(initial));
const template=structuredClone(initial);template.keys[0].nodes=[{object:'POISON',id:0xffff,velocity:NaN,position:NaN}];
let snapshot=driver.before(template,0,{warmup:true});raw.process(snapshot,{timeStep:0});driver.after(raw);
let retiredFrame=null;
for(let frame=0;frame<=1984;frame+=64){
 snapshot=driver.before(template,frame);const output=raw.process(snapshot);driver.after(raw);
 assert.ok(snapshot.keys[0].nodes.every(n=>n.object!=='POISON'));
 if(frame===640){assert.equal(snapshot.keys[0].nodes.length,2);assert.equal(output.values[0],1);}
 if(driver.retirements&&retiredFrame===null)retiredFrame=frame;
 if(frame===1920){assert.equal(driver.nodes[0].length,1);assert.equal(output.values[0],1);}
}
assert.equal(retiredFrame,1728);assert.equal(driver.births,1);assert.equal(driver.reuses,1);assert.equal(driver.retirements,1);
assert.throws(()=>driver.before(template,2112));
const head={position:0,velocity:-100,id:0,tag:0},node={position:0,velocity:-100,id:7,tag:2};
assert.equal(rawNodeCanRetire(node,head,1,[]),true);
assert.equal(rawNodeCanRetire(head,head,1,[]),false);
assert.equal(rawNodeCanRetire({...node,velocity:0},head,1,[]),false);
assert.equal(rawNodeCanRetire(node,{...head,velocity:1},1,[]),false);
assert.equal(rawNodeCanRetire({...node,position:.1},head,1,[]),false);
assert.equal(rawNodeCanRetire(node,head,1,[{id:7,tag:2}]),false);
assert.equal(rawNodeCanRetire(node,head,1,[{id:7,tag:3}]),true);
assert.equal(rawNodeCanRetire({...node,id:0xfffe},head,1,[{id:5,tag:2}]),false);
assert.equal(rawNodeCanRetire({...node,tag:0xfffe},head,1,[{id:7,tag:8}]),false);
assert.equal(rawNodeCanRetire({...node,id:0xfffe,tag:0xfffe},head,1,[{id:5,tag:8}]),false);
assert.equal(rawNodeCanRetire({...node,position:1},{...head,position:1},0,[]),true);
console.log('Owned raw-node birth/reuse/cleanup, ignored native topology, sequential clock and cleanup ownership/wildcard guards passed (synthetic).');
