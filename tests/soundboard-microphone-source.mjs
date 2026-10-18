import assert from 'node:assert/strict';
import {constructSoundboardMicrophoneSources} from '../dsp/soundboard-microphone-source.mjs';
const model=new Uint8Array(0x340);new DataView(model.buffer).setFloat32(0x1d4,0.25,true);
const curve=()=>({x:[10,20],y:[1,2],dimensions:1,mode:0,logX:0});
const fixture=()=>({schema:1,soloMicrophone:0,output:{version:3,kind:3,matrix_version:2,records:[
  {version:5,type:0,control:4,flags:[1,0]},
  {version:5,type:1,control:4,flags:[1,0]},
  {version:5,type:1,control:4,flags:[0,0]},
  {version:5,type:1,control:0,flags:[1,0]}].map((r,i)=>({...r,position:[i,i+1,i+2],angles:[-90,0]}))},registry:[
  {id:0,amount:0.75,mix:0.5,curve:curve()},
  {id:4,amount:0.8,mix:0.9,curve:curve()}]});
const own=constructSoundboardMicrophoneSources(fixture(),model);
assert.deepEqual(own.indices,[1,2,3]);
assert.deepEqual(own.primary.map(p=>Array.from(p)),[[1,2,3],[2,3,4],[3,4,5]]);
assert.deepEqual(own.offsets.map(p=>Array.from(p)),[[1,0,0],[1,0,0],[1,0,0]]);
assert.deepEqual(Array.from(own.parents),[0,1,2]);
assert.deepEqual(Array.from(own.flags),[1,0,1]);
assert.deepEqual(Array.from(own.amounts),[0,Math.fround(0.8),0.25]);
assert.deepEqual(Array.from(own.mixes),[Math.fround(0.9),Math.fround(0.9),0.5]);
assert.equal(own.nativeRuntimeCurvesUsedForConstruction,false);
const reject=change=>{const f=fixture();change(f);assert.throws(()=>constructSoundboardMicrophoneSources(f,model),RangeError);};
reject(f=>f.output.kind=2);
reject(f=>f.soloMicrophone=1);
reject(f=>f.output.records[1].type=2);
reject(f=>f.output.records[1].control=10001);
reject(f=>f.output.records[1].flags[0]=-1);
reject(f=>f.output.records[1].position[0]=NaN);
reject(f=>f.output.records[1].angles[0]=NaN);
reject(f=>f.output.records[1].angles.pop());
reject(f=>f.output.records[1].angles[0]=1e6);
reject(f=>f.registry.push({...f.registry[0]}));
reject(f=>f.registry=[]);
reject(f=>f.registry[1].amount=Infinity);
reject(f=>f.registry[1].curve.x=[20,10]);
reject(f=>f.registry[1].curve.logX=1);
reject(f=>f.registry[1].curve.y.pop());
const otherFamily=model.slice();new DataView(otherFamily.buffer).setUint32(0x98,1,true);
assert.throws(()=>constructSoundboardMicrophoneSources(fixture(),otherFamily),RangeError);
console.log('microphone source mapping, whitening branches and rejection checks passed');
