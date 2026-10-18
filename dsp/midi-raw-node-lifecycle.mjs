import {archiveRawKeyControls} from './archive-raw-key-controls.mjs';
import {archiveKeyReleaseControls} from './archive-key-release-controls.mjs';
import {createMidiKeyReleaseTimeline} from './midi-key-release-timeline.mjs';
const f=Math.fround;
// 90cab4. Voice ownership is supplied explicitly; this does not retire voices.
export function rawNodeCanRetire(node,head,flag,voices){
 if(![0,1].includes(flag)||![node.position,node.velocity,head.position,head.velocity].every(Number.isFinite))
  throw Error('Finite raw-node cleanup state and binary flag required');
 if(node===head||node.velocity>=0||node.position!==(flag^1)||node.position!==head.position||head.velocity>=0)return false;
 return !voices.some(v=>(node.id===0xfffe||v.id===node.id)&&(node.tag===0xfffe||v.tag===node.tag));
}
// Cold single-key fixture: initial host controls remain observed inputs.
// Per-key flags/cap controls come from current base/preset archives.
// 573bf4..573c28 builds fallback nodes from archive baseTime and (7,0).
// All subsequent node identities, births, reuse and cleanup are engine-owned.
export class MidiRawNodeLifecycle {
 constructor(initial,{baseFields,presetFields,eventClock,keyIndex,initialNoteBase=9}){
  if(!Number.isInteger(keyIndex)||keyIndex<0||keyIndex>=initial.keys.length||
     !Number.isInteger(initialNoteBase)||initialNoteBase<0||initialNoteBase+initial.keys.length>128||initialNoteBase+keyIndex!==69||
     eventClock.events.some(e=>(e.kind==='noteOn'||e.kind==='noteOff')&&(e.channel!==0||e.note!==69||e.frame===0)))
   throw Error('Explicit cold supported single-key lifecycle required');
  this.controls={samples:eventClock.blockSize,sampleRate:eventClock.sampleRate,
   ...Object.fromEntries(['hostControl','hostBlend','softControl','pedalControl','extraPedalControl','binaryPedal','bypassFlags'].map(k=>[k,structuredClone(initial[k])])),
   keys:initial.keys.map((_,i)=>archiveRawKeyControls({baseFields,presetFields,note:initialNoteBase+i}))};
  this.timeline=createMidiKeyReleaseTimeline({baseFields,presetFields,eventClock});
  this.events=eventClock.events.filter(e=>e.kind==='noteOn'||e.kind==='noteOff');
  this.nodes=this.controls.keys.map((k,i)=>{
   const {baseTime}=archiveKeyReleaseControls({baseFields,note:initialNoteBase+i,runtimeCurveMode:'linear-clamp'});
   return [{object:`owned-key-${i}-initial`,id:7,tag:0,velocity:f(-1/baseTime),position:k.flags[0]^1,intermediate:0}];
  });
  this.keyIndex=keyIndex;this.eventIndex=0;this.lastFrame=-64;this.calls=0;this.births=0;this.reuses=0;this.retirements=0;this.pending=null;
 }
 initialState(){return {...structuredClone(this.controls),keys:this.controls.keys.map((key,i)=>({...structuredClone(key),nodes:this.nodes[i].map(n=>({...n}))}))};}
 before(frame,{warmup=false}={}){
  if(this.pending||!Number.isSafeInteger(frame)||frame<0||frame%64||
     (warmup?(this.calls!==0||frame!==0):frame!==this.lastFrame+64))throw Error('Sequential raw-node lifecycle clock required');
  if(!warmup){
   while(this.eventIndex<this.events.length&&this.events[this.eventIndex].frame===frame){
    const event=this.events[this.eventIndex++],nodes=this.nodes[this.keyIndex];
    let node=nodes.find(n=>n.id===0&&n.tag===0);
    if(event.kind==='noteOn'){
     if(!node){node={object:`owned-key-${this.keyIndex}-midi`,id:0,tag:0,velocity:f(1e10),position:0,intermediate:0};nodes.unshift(node);this.births++;}
     else this.reuses++;
    }
    if(node)node.velocity=this.timeline.velocityAtFrame(frame);
   }
   this.lastFrame=frame;
  }
  this.calls++;this.pending=true;
  return this.initialState();
 }
 after(raw){
  if(!this.pending)throw Error('Raw-node lifecycle process must precede cleanup');
  this.nodes.forEach((nodes,i)=>{
   for(const node of nodes){const state=raw.nodes.get(node.object);if(!state)throw Error('Owned integrated node state required');node.position=state.position;node.intermediate=state.intermediate;}
   const head=nodes[0],voices=i===this.keyIndex&&this.births?[{id:0,tag:0}]:[];
   this.nodes[i]=nodes.filter(node=>{const retire=rawNodeCanRetire(node,head,this.controls.keys[i].flags[0],voices);if(retire)this.retirements++;return !retire;});
  });
  this.pending=null;
 }
 summary(){return {calls:this.calls,births:this.births,reuses:this.reuses,retirements:this.retirements,
  nativeDynamicNodeVelocitiesUsedForPrediction:false,nativeDynamicNodeListsAndIdentitiesUsedForPrediction:false,nativeInitialRawNodeProfileUsedForPrediction:false,
  nativeKeyCountAndNoteMappingStillExplicit:true,nativePerBlockRawKeySnapshotsUsedForPrediction:false,
  nativeInitialKeyFlagAndLocalControlProfileUsedForPrediction:false,nativeInitialHostControlProfileStillObserved:true,
  keyMappingStillExplicit:true,completeVoiceOwnershipOrRetirementImplemented:false};}
}
