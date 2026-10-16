// Fixed 64-frame bank. Configuration/IR initialization is still supplied externally.
import {fma32} from './modal-kernel.mjs';
import {forwardReal128} from './real-fft-finalize.mjs';
import {inverseReal128} from './real-fft-inverse.mjs';
import {accumulatePackedRealSpectrum} from './packed-convolution-product.mjs';
import {normalizedOverlap128} from './convolution-overlap.mjs';
const f=Math.fround;
export function isSilentBlock64(input){
 if(input.length!==64)throw new Error('Unverified input block size');
 if(input[0]!==0||input[63]!==0)return false;
 const energy=new Float32Array(4);
 for(let i=0;i<64;i+=4)for(let lane=0;lane<4;lane++)energy[lane]=fma32(input[i+lane],input[i+lane],energy[lane]);
 return f(f(energy[0]+energy[2])+f(energy[1]+energy[3]))===0;
}
export function partitionSlot(count,cursor,lag){
 if(!Number.isInteger(count)||count<1||!Number.isInteger(cursor)||cursor<0||cursor>=count||!Number.isInteger(lag)||lag<0||lag>=count)throw new Error('Invalid partition ring index');
 const index=count+cursor-1-lag;return index>=count?index-count:index;
}
function copyRing(r,kernel){
 if(r===null)return null;
 return {...r,slots:r.slots.map(s=>{
  if(!kernel&&!s.empty)throw new Error('Nonempty initial input ring not covered');
  if(kernel&&!s.empty&&(s.content!==1||s.timeInput?.length!==128))throw new Error('Kernel time input required');
  return {...s,transformed:kernel,data:kernel&&!s.empty?forwardReal128(s.timeInput):null};
 })};
}
export class PartitionedConvolution64 {
 constructor(config){
  if(config.blockSize!==64||config.inputCount!==9||config.stepCount!==1||config.plans.length!==1)throw new Error('Unverified convolution bank plan');
  this.inputs=config.inputs.map(r=>copyRing(r,false));this.kernels=config.kernels.map(r=>copyRing(r,true));
  this.routes=config.routes;this.plan=config.plans[0];this.timestamp=0;this.nextChannel=0;
  this.channels=this.inputs.map((r,i)=>r?i:-1).filter(i=>i>=0);
  this.outputs=config.outputs.map(o=>{
   if(!o)return null;
   if(!o.fft.empty||o.history.length!==64||o.history.some(x=>x!==0))throw new Error('Nonempty initial output/history not covered');
   return {...o,fft:{...o.fft},history:new Float32Array(64),empty:true,data:new Float32Array(128)};
  });
 }
 push(channel,timestamp,input){
  if(channel!==this.channels[this.nextChannel]||timestamp!==this.timestamp)throw new Error('Unverified input push chronology');
  const ring=this.inputs[channel],slot=ring.slots[ring.cursor];
  const before={...slot};delete before.data;delete before.transformed;
  slot.timestamp=timestamp;slot.empty=Number(isSilentBlock64(input));
  if(!slot.empty){slot.data=new Float32Array(128);slot.data.set(input);slot.content=1;slot.transformed=false;}
  ring.cursor=(ring.cursor+1)%ring.slots.length;ring.ready=0;
  this.nextChannel++;
  if(this.nextChannel===this.channels.length){this.nextChannel=0;this.timestamp=(this.timestamp+64)>>>0;}
  return before;
 }
 run(){
  if(this.nextChannel)throw new Error('Partial input block at scheduling');
  const products=[],outputs=new Map(),readoutBlocks=new Map();
  for(const [kind,index,lag] of this.plan){
   if(kind===0){
    const ring=this.inputs[index];if(!ring)throw new Error('Missing transform ring');
    const slot=ring.slots[partitionSlot(ring.slots.length,ring.cursor,0)];
    if(!slot.empty){if(slot.content!==1||slot.transformed)throw new Error('Input already transformed');slot.data=forwardReal128(slot.data);slot.transformed=true;}
    ring.ready=1;
   }else if(kind===1){
    const route=this.routes[index];if(!route)throw new Error('Missing convolution route');
    const [inputIndex,outputIndex,kernelIndex,scale]=route;
    const ir=this.inputs[inputIndex],kr=this.kernels[kernelIndex],out=this.outputs[outputIndex];
    if(!ir||!kr||!out)throw new Error('Missing convolution state');
    const a=ir.slots[partitionSlot(ir.slots.length,ir.cursor,lag)],b=kr.slots[partitionSlot(kr.slots.length,kr.cursor,lag)];
    if(a.empty||b.empty||scale===0)continue;
    if(a.content!==1||b.content!==1||!a.transformed||!b.transformed)throw new Error('Untransformed product source');
    if(out.empty){out.data.fill(0);out.empty=false;}
    products.push({a,b,destination:out.fft,scale,before:out.data.slice()});
    accumulatePackedRealSpectrum(a.data,b.data,out.data,scale);
   }else if(kind===2){
    const out=this.outputs[index];if(!out)throw new Error('Missing inverse output');
    if(!out.empty){
     const inverse=inverseReal128(out.data),mixed=normalizedOverlap128(inverse,out.history);
     outputs.set(out.fft.object,{object:out.fft.object,inverse,...mixed});out.history=mixed.tail;
     readoutBlocks.set(out.fft.object,mixed.output);
    }else {readoutBlocks.set(out.fft.object,out.history.slice());out.history=new Float32Array(64);}
    out.empty=true;
   }else throw new Error('Unknown convolution command');
  }
  return {products,outputs,readoutBlocks};
 }
}
