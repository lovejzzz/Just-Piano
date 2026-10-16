// 5b5698: ID/mask gate, release response, and bounded duration to velocity.
import {fma32} from './modal-kernel.mjs';
import {nativeScalarLogf} from './native-scalar-log.mjs';
import {nativeScalarPowf} from './native-scalar-pow.mjs';
const f=Math.fround;
export class KeyNoteOffVelocity {
 constructor(initial){
  this.nodes=new Map();this.events=0;this.writes=0;this.newNodes=0;
  for(let key=0;key<initial.keys.length;key++)for(const node of initial.keys[key].nodes){
   if(this.nodes.has(node.object)||!Number.isFinite(node.velocity))throw new Error('Invalid initial node velocity profile');
   this.nodes.set(node.object,{key,velocity:f(node.velocity),id:node.id,tag:node.tag,mask:node.mask>>>0});
  }
 }
 ensureNodes(snapshot){
  for(let key=0;key<snapshot.keys.length;key++)for(const node of snapshot.keys[key].nodes){
   if(!this.nodes.has(node.object)){
    if(node.position!==0||node.intermediate!==0||node.velocity!==f(1e10))throw new Error('Only zero-state positive-sentinel node birth verified');
    this.nodes.set(node.object,{key,velocity:f(1e10),id:node.id,tag:node.tag,mask:node.mask>>>0});this.newNodes++;
   }
   if(this.nodes.get(node.object).key!==key)throw new Error('Note-off node owner changed');
  }
 }
 apply(event){
  if(!Number.isFinite(event.release)||!Number.isInteger(event.id)||(event.id>=1024&&event.id!==0xfffe)||event.id<0||!Number.isInteger(event.tag)||!Number.isInteger(event.clearMask)||!Number.isInteger(event.negativeOnly))throw new Error('Unverified note-off input branch');
  const {baseTime,maximumTime,amplitudeScale}=event.controls;
  if(![baseTime,maximumTime,amplitudeScale].every(Number.isFinite)||baseTime<=0||maximumTime<=0)throw new Error('Invalid note-off time controls');
  this.events++;const all=event.id===0xfffe||event.tag===0xfffe,updates=[];
  for(const input of event.nodes){
   const node=this.nodes.get(input.object);if(!node||node.key!==event.key)throw new Error('Unknown note-off node');
   if(event.id!==0xfffe&&node.id!==event.id)continue;
   if(event.tag!==0xfffe&&node.tag!==event.tag)continue;
   node.mask=(node.mask&~event.clearMask)>>>0;
   if(node.mask!==0||(event.negativeOnly!==0&&node.velocity>=0))continue;
   let time=f(baseTime);
   if(amplitudeScale!==1&&input.voice!=='0x0'){
    if(!Number.isFinite(input.voiceAmplitude))throw new Error('Missing observed note-off voice amplitude');
    const square=f(f(input.voiceAmplitude)*f(input.voiceAmplitude)),fourth=f(square*square);
    time=f(f(baseTime)*fma32(f(f(amplitudeScale)-1),fourth,1));
   }
   const release=f(event.release)===0?1:f(event.release);let pow=null;
   if(release!==1){
    const exponent=f(nativeScalarLogf(f(f(baseTime)/f(maximumTime)))/f(-4.844187259674072));
    const base=Math.min(1,Math.max(f(1/127),release)),result=nativeScalarPowf(base,exponent);
    time=f(time*f(1/result));pow={base,exponent,result};
   }
   const duration=Math.min(f(maximumTime),Math.max(f(baseTime),time));
   node.velocity=f(-1/duration);this.writes++;
   updates.push({object:input.object,velocity:node.velocity,duration,pow});
   if(!all)break;
  }
  return updates;
 }
 velocities(){return new Map([...this.nodes].map(([key,node])=>[key,node.velocity]));}
}
