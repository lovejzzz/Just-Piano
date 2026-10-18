import {createMidiKeyReleaseTimeline} from './midi-key-release-timeline.mjs';
// Numeric velocity producer only. Native node topology/identity and the initial
// fallback velocity profile remain explicit inputs to this supported fixture.
export class MidiRawNodeVelocities {
  constructor(initial,{baseFields,presetFields,eventClock,keyIndex}) {
    if(!Number.isInteger(keyIndex)||keyIndex<0||keyIndex>=initial.keys.length||
       eventClock.events.some(e=>(e.kind==='noteOn'||e.kind==='noteOff')&&(e.note!==69||e.channel!==0)))
      throw Error('Explicit supported MIDI key mapping required');
    this.timeline=createMidiKeyReleaseTimeline({baseFields,presetFields,eventClock});
    this.birthFrames=new Set(eventClock.events.filter(e=>e.kind==='noteOn').map(e=>e.frame));
    this.initial=new Map();this.dynamic=new Set();this.keyIndex=keyIndex;
    this.calls=0;this.dynamicValues=0;
    initial.keys.forEach((key,i)=>key.nodes.forEach(node=>{
      if(this.initial.has(node.object)||!Number.isFinite(node.velocity))throw Error('Unique finite initial raw-node profile required');
      this.initial.set(node.object,{key:i,id:node.id,tag:node.tag,velocity:Math.fround(node.velocity)});
    }));
  }
  velocitiesFor(snapshot,frame){
    const velocity=this.timeline.velocityAtFrame(frame),values=new Map();this.calls++;
    snapshot.keys.forEach((key,i)=>key.nodes.forEach(node=>{
      const initial=this.initial.get(node.object);
      if(initial){
        if(initial.key!==i||initial.id!==node.id||initial.tag!==node.tag)throw Error('Raw-node identity rebound');
        values.set(node.object,initial.velocity);
      }else{
        if(i!==this.keyIndex||node.id!==0||node.tag!==0)throw Error('Unsupported MIDI raw-node birth');
        if(!this.dynamic.has(node.object)){
          if(this.dynamic.size||!this.birthFrames.has(frame))throw Error('Supported MIDI-aligned raw-node birth required');
          this.dynamic.add(node.object);
        }
        values.set(node.object,velocity);this.dynamicValues++;
      }
    }));
    return values;
  }
  summary(){return {calls:this.calls,initialNodes:this.initial.size,dynamicNodes:this.dynamic.size,dynamicValues:this.dynamicValues,
    nativeDynamicNodeVelocitiesUsedForPrediction:false,nativeInitialVelocityProfileStillObserved:true,
    nativeNodeListsAndIdentitiesStillObserved:true,keyMappingStillExplicit:true};}
}
