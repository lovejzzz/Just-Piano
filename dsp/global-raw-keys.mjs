// Numeric node/cap/aggregation portion of 5e1d18; voice handoff and list retirement are external.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround,clamp=x=>Math.min(1,Math.max(0,x));
export class GlobalRawKeys {
 constructor(initial){
  this.keyCount=initial.keys.length;this.nodes=new Map();this.nodeBirths=0;this.positiveSteps=0;this.nonzeroReleaseSteps=0;
  for(let i=0;i<this.keyCount;i++)for(const node of initial.keys[i].nodes){
   if(this.nodes.has(node.object)||![node.position,node.intermediate].every(Number.isFinite))throw new Error('Invalid initial raw key nodes');
   this.nodes.set(node.object,{key:i,position:f(node.position),intermediate:f(node.intermediate)});
  }
  this.initialNodeCount=this.nodes.size;
 }
 ensureNodes(snapshot){
  if(snapshot.keys.length!==this.keyCount)throw new Error('Raw key count changed');
  for(let i=0;i<this.keyCount;i++)for(const node of snapshot.keys[i].nodes){
   if(!this.nodes.has(node.object)){
    if(node.position!==0||node.intermediate!==0)throw new Error('Only zero-state new raw nodes verified');
    this.nodes.set(node.object,{key:i,position:0,intermediate:0});this.nodeBirths++;
   }
   if(this.nodes.get(node.object).key!==i)throw new Error('Raw node owner changed');
  }
 }
 process(snapshot,{nodeVelocities}={}){
  const {samples,sampleRate,hostControl,hostBlend,softControl,pedalControl,binaryPedal,bypassFlags}=snapshot;
  if(!Number.isInteger(samples)||samples<=0||![sampleRate,hostControl,hostBlend,softControl,pedalControl].every(Number.isFinite)||sampleRate<=0||bypassFlags.length!==2||bypassFlags.some(x=>x!==0))throw new Error('Unverified raw key clock/extra processors');
  this.ensureNodes(snapshot);const dt=f(f(samples)/f(sampleRate)),values=[],flags=[];
  for(let i=0;i<this.keyCount;i++){
   const key=snapshot.keys[i];
   if(![key.localControl,key.localSoftControl].every(Number.isFinite)||key.flags.length!==3)throw new Error('Invalid raw key controls');
   let control=clamp(f(f(f(hostControl)+f(key.localControl))*f(1-f(hostBlend))));
   if(control<f(0.01))control=0;
   const soft=clamp(f(f(softControl)*f(1-f(key.localSoftControl))));
   const keyCap=f(1-control),softCap=f(1-soft);let aggregate=key.flags[2]!==0?1:0;
   for(const input of key.nodes){
    const node=this.nodes.get(input.object),velocity=f(nodeVelocities?nodeVelocities.get(input.object):input.velocity);
    if(!Number.isFinite(velocity))throw new Error('Nonfinite raw node velocity');
    if(!(key.flags[0]&1)){node.position=1;node.intermediate=1;}
    else{
     let position=key.flags[1]&1?1:node.position;
     if(!(key.flags[1]&1)&&dt!==0){
      if(velocity>0)this.positiveSteps++;
      if(velocity<0&&node.position>0)this.nonzeroReleaseSteps++;
      position=Math.max(0,fma32(dt,velocity,node.position));
     }
     node.intermediate=Math.min(position,keyCap);node.position=Math.min(node.intermediate,softCap);
    }
    if(node.position>aggregate)aggregate=node.position;
   }
   values.push((binaryPedal&1)&&pedalControl>0.5?1:aggregate);flags.push(0);
  }
  return {dt,values,flags};
 }
}
