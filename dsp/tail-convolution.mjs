// Fixed observed profile: 9x64 source blocks, 512-frame bank, two startup output blocks.
import {TailInputQueue512} from './tail-queue.mjs';
import {PartitionedConvolution512} from './partitioned-convolution.mjs';
export class QueuedTailConvolution512 {
 constructor(config){
  this.model=new PartitionedConvolution512(config);this.input=new TailInputQueue512();this.frame=0;
  this.outputs=Array.from({length:2},()=>({generation:null,rows:Array.from({length:3},()=>new Float32Array(512))}));
 }
 process64(source){
  const position=this.input.position,current=this.outputs[0];
  const output=current.rows.map(row=>row.slice(position,position+64));
  const write=this.input.write(source);let work=null;
  if(write.completedChunk){
   const ordinal=this.input.completed-1;
   for(let row=0;row<9;row++)this.model.push(row,ordinal*512,write.completedChunk[row]);
   const computed=this.model.run(),rows=this.model.outputs.map(o=>computed.readoutBlocks.get(o.fft.object));
   work={ordinal,source:write.completedChunk,output:rows,products:computed.products.length,nonemptyOutputs:computed.outputs.size};
   this.outputs.shift();this.outputs.push({generation:ordinal,rows});
  }
  this.frame+=64;
  return {output,generation:current.generation,position,work};
 }
}
