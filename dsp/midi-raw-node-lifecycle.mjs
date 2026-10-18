import {createMidiKeyReleaseTimeline} from './midi-key-release-timeline.mjs';
const f=Math.fround;
// 90cab4. Voice ownership is supplied explicitly; this does not retire voices.
export function rawNodeCanRetire(node,head,flag,voices){
 if(![0,1].includes(flag)||![node.position,node.velocity,head.position,head.velocity].every(Number.isFinite))
  throw Error('Finite raw-node cleanup state and binary flag required');
 if(node===head||node.velocity>=0||node.position!==(flag^1)||node.position!==head.position||head.velocity>=0)return false;
 return !voices.some(v=>(node.id===0xfffe||v.id===node.id)&&(node.tag===0xfffe||v.tag===node.tag));
}
// Cold single-key fixture: native initial numeric/control profile remains input.
// All subsequent node identities, births, reuse and cleanup are engine-owned.
export class MidiRawNodeLifecycle {
 constructor(initial,{baseFields,presetFields,eventClock,keyIndex}){
  if(!Number.isInteger(keyIndex)||keyIndex<0||keyIndex>=initial.keys.length||
     initial.keys.some(k=>k.nodes.length!==1||k.nodes[0].id!==7||k.nodes[0].tag!==0||((k.flags[0]&1)&&k.nodes[0].position!==0)||k.nodes[0].intermediate!==0||!Number.isFinite(k.nodes[0].velocity)||k.nodes[0].velocity>=0)||
     eventClock.events.some(e=>(e.kind==='noteOn'||e.kind==='noteOff')&&(e.channel!==0||e.note!==69||e.frame===0)))
   throw Error('Explicit cold supported single-key lifecycle required');
  this.timeline=createMidiKeyReleaseTimeline({baseFields,presetFields,eventClock});
  this.events=eventClock.events.filter(e=>e.kind==='noteOn'||e.kind==='noteOff');
  this.nodes=initial.keys.map((k,i)=>[{object:`owned-key-${i}-initial`,id:7,tag:0,velocity:f(k.nodes[0].velocity),position:(k.flags[0]&1)?0:1,intermediate:0}]);
  this.keyIndex=keyIndex;this.eventIndex=0;this.lastFrame=-64;this.calls=0;this.births=0;this.reuses=0;this.retirements=0;this.pending=null;
 }
 initialState(snapshot){return {...snapshot,keys:snapshot.keys.map((key,i)=>({...key,nodes:this.nodes[i].map(n=>({...n}))}))};}
 before(snapshot,frame,{warmup=false}={}){
  if(this.pending||!Number.isSafeInteger(frame)||frame<0||frame%64||snapshot.keys.length!==this.nodes.length||
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
  this.calls++;this.pending=snapshot;
  return this.initialState(snapshot);
 }
 after(raw){
  if(!this.pending)throw Error('Raw-node lifecycle process must precede cleanup');
  this.nodes.forEach((nodes,i)=>{
   for(const node of nodes){const state=raw.nodes.get(node.object);if(!state)throw Error('Owned integrated node state required');node.position=state.position;node.intermediate=state.intermediate;}
   const head=nodes[0],voices=i===this.keyIndex&&this.births?[{id:0,tag:0}]:[];
   this.nodes[i]=nodes.filter(node=>{const retire=rawNodeCanRetire(node,head,this.pending.keys[i].flags[0],voices);if(retire)this.retirements++;return !retire;});
  });
  this.pending=null;
 }
 summary(){return {calls:this.calls,births:this.births,reuses:this.reuses,retirements:this.retirements,
  nativeDynamicNodeVelocitiesUsedForPrediction:false,nativeDynamicNodeListsAndIdentitiesUsedForPrediction:false,nativeInitialNodeLayoutStillObserved:true,
  nativeInitialNumericProfileStillObserved:true,nativeFlagsAndHostKeyControlsStillObserved:true,
  keyMappingStillExplicit:true,completeVoiceOwnershipOrRetirementImplemented:false};}
}
