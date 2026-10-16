// Fixed observed outer profile: unit input gain, additive 64-frame head and queued tail.
import {PartitionedConvolution64} from './partitioned-convolution.mjs';
import {QueuedTailConvolution512} from './tail-convolution.mjs';
import {combineConvolutionReadout} from './convolution-readout.mjs';
import {addQueuedTail64} from './tail-queue.mjs';
export class CabinetConvolution64 {
 constructor(headConfig,tailConfig){
  this.head=new PartitionedConvolution64(headConfig);this.tail=new QueuedTailConvolution512(tailConfig);this.frame=0;
 }
 process64(source,before,mode=1){
  if(mode!==1||source.length!==9||source.some(row=>row.length!==64)||before.length!==3||before.some(row=>row.length!==64))throw new Error('Unverified cabinet input profile');
  for(let row=0;row<9;row++)this.head.push(row,this.frame,source[row]);
  const head=this.head.run();
  const headOutput=this.head.outputs.map((o,row)=>combineConvolutionReadout(head.readoutBlocks.get(o.fft.object),[],1,before[row]));
  const tail=this.tail.process64(source);this.frame+=64;
  return {output:addQueuedTail64(headOutput,tail.output),headOutput,tailOutput:tail.output,
   tailGeneration:tail.generation,tailPosition:tail.position,tailWork:tail.work,
   headProducts:head.products.length,headNonemptyOutputs:head.outputs.size};
 }
}
