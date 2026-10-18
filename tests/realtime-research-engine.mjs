import assert from 'node:assert/strict';
import {RealtimeResearchEngine} from '../dsp/realtime-research-engine.mjs';
import {renderSixteen} from '../dsp/modal-kernel.mjs';
// Synthetic fixtures only; private commercial model data is never needed here.
const notes=Array.from({length:88},(_,i)=>{
 const note=i+21,frequency=Float32Array.from({length:16},(_,j)=>440*2**((note-69)/12)*(1+Math.floor(j/2))*(j%2?1.001:1));
 return {note,columns:2,frequency,decay:new Float32Array(16).fill(2),P:new Float32Array(16),Q:Float32Array.from(frequency,x=>.03*Math.sin(2*Math.PI*x/48000)),cosine:Float32Array.from(frequency,x=>Math.cos(2*Math.PI*x/48000)),damping:{releaseLow:500,releaseHigh:1000,releaseShape:1}};
});
const model={schema:'just-piano-live-research-v1',sampleRate:48000,inputContract:'model-preset-only',nativeSnapshotsUsed:false,renderedNoteAudioUsed:false,notes,
 bank:[21,108].flatMap(key=>Array.from({length:3},(_,variant)=>({identity:`${key}:${variant}`,key,variant,samples:new Float32Array(128)})))};
function render({release=false,sustain=false,velocity=100,hardness=.35,soft=0,decay=1}={}){
 const engine=new RealtimeResearchEngine(model),left=new Float32Array(128),right=new Float32Array(128);let energy=0;
 engine.message({type:'param',key:'hardness',value:hardness});engine.message({type:'param',key:'decay',value:decay});engine.message({type:'soft',value:soft});engine.noteOn(60,velocity);
 engine.message({type:'sustain',on:sustain});if(release)engine.noteOff(60);
 for(let i=0;i<150;i++){engine.render(left,right);for(const x of left){assert(Number.isFinite(x));energy+=x*x;}}
 return {energy,engine,left,right};
}
const normal=render();assert(normal.energy>0);
assert(render({velocity:30}).energy<normal.energy*.1);
assert(render({soft:1}).energy<normal.energy);
assert(render({hardness:1}).energy>render({hardness:0}).energy);
assert(render({decay:1.8}).energy>render({decay:.4}).energy);
assert(render({release:true}).energy<render({release:true,sustain:true}).energy*.15);
assert.deepEqual(render().left,normal.left);
normal.engine.message({type:'allOff'});normal.engine.render(normal.left,normal.right);assert(normal.left.every(x=>x===0));
for(const n of notes)normal.engine.noteOn(n.note,127);
normal.engine.render(normal.left,normal.right);assert(normal.engine.statistics().activeVoices<=24);assert.equal(normal.engine.nonfinite,0);
assert.throws(()=>new RealtimeResearchEngine({...model,nativeSnapshotsUsed:true}));
// Reusing worklet scratch must preserve the verified float32 arithmetic exactly.
const make=()=>[Float32Array.from({length:16},(_,i)=>Math.fround(Math.sin(i))),Float32Array.from({length:16},(_,i)=>Math.fround(Math.cos(i))),new Float32Array(16).fill(-.999),new Float32Array(16).fill(1.98)];
const a=make(),b=make(),x=new Float32Array(128),y=new Float32Array(128),scratch=Array.from({length:4},()=>new Float32Array(16));
for(let i=0;i<12;i++){renderSixteen(...a,x);renderSixteen(...b,y,scratch);assert.deepEqual(x,y);assert.deepEqual(a,b);}
console.log('PASS: live synthesis, velocity/touch/decay/hammer, sustain/release, panic, polyphony, input boundary and bit-exact reusable scratch');
