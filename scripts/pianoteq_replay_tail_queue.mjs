import fs from 'node:fs';
import crypto from 'node:crypto';
import {encodeObservedPcm24} from '../dsp/pcm24.mjs';
import {TailInputQueue512,addQueuedTail64} from '../dsp/tail-queue.mjs';
import {combineConvolutionReadout} from '../dsp/convolution-readout.mjs';
import {PartitionedConvolution64} from '../dsp/partitioned-convolution.mjs';
const [capturePath,reportPath,...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--kernel-time-inputs','--observed-wav','--reference-wav','--head-capture'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid timeline options');options[args[i]]=args[i+1];}
if(!capturePath||!reportPath||Object.keys(options).length!==4)throw new Error('Usage: capture.json report.json --head-capture head.json --kernel-time-inputs kernels.json --observed-wav actual.wav --reference-wav official.wav');
const kernelPath=options['--kernel-time-inputs'];
function readPcm(path){
 const wav=fs.readFileSync(path);let format,audio;
 if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw new Error('WAV required');
 for(let p=12;p+8<=wav.length;){const n=wav.readUInt32LE(p+4),id=wav.toString('ascii',p,p+4);if(p+8+n>wav.length)throw new Error('Truncated WAV');if(id==='fmt ')format=wav.subarray(p+8,p+8+n);if(id==='data')audio=wav.subarray(p+8,p+8+n);p+=8+n+(n&1);}
 if(!format||format.readUInt16LE(0)!==1||format.readUInt16LE(2)!==2||format.readUInt32LE(4)!==48000||format.readUInt16LE(14)!==24||!audio)throw new Error('Stereo 48kHz PCM24 required');
 return audio;
}
const observedPcm=readPcm(options['--observed-wav']),referencePcm=readPcm(options['--reference-wav']);
let pcmFrames=0,pcmAlignmentDifferences=0,referencePrefixDifferences=0,firstReferenceDifferenceFrame=null;
const captureBytes=fs.readFileSync(capturePath),data=JSON.parse(captureBytes),headBytes=fs.readFileSync(options['--head-capture']),headSeed=JSON.parse(headBytes),kernelEvidence=JSON.parse(fs.readFileSync(kernelPath,'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(kernelEvidence.schema!==1||kernelEvidence.crossRunInitialization!==true||kernelEvidence.targetSha256!==sha(headBytes)||kernelEvidence.sourceSha256!==sha(fs.readFileSync(kernelEvidence.sourceCapture)))throw new Error('Kernel evidence binding differs');
if(data.schema!==1||data.threadIndexFilter!==1||data.minimumFrames!==8192||!data.windowComplete||data.errors.length)throw new Error('Complete scheduler window required');
if(headSeed.schema!==3||!headSeed.windowComplete||headSeed.errors.length)throw new Error('Verified head seed capture required');
const kernelView=new DataView(new ArrayBuffer(4));
const banks=new Map(Object.entries(headSeed.configs).map(([key,c])=>{
 const kernels=c.kernels.map(r=>r&&({...r,slots:r.slots.map(s=>{
  if(s.empty)return s;
  const source=kernelEvidence.kernels[key]?.[s.object];if(source?.inputBits.length!==128)throw new Error('Kernel time producer missing');
  const timeInput=Float32Array.from(source.inputBits,bits=>{kernelView.setUint32(0,bits);return kernelView.getFloat32(0);});
  return {...s,timeInput};
 })}));
 return [key,{model:new PartitionedConvolution64({...c,kernels})}];
}));
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
if(banks.size!==1)throw new Error('One seeded head required');
const model=[...banks.values()][0].model,queue=new TailInputQueue512();
const inputPackets=[];
let context=null,partialInputChecks=0,completedInputChecksSkipped=0,tailNonzeroBlocks=0,firstTailNonzeroFrame=null,lastPartialInput=null,lastPartialOutput=null;
const failures=[];let floatCount=0,scalarCount=0,mismatches=0,pushes=0,schedules=0,outputs=0,predictedProducts=0;
function scalar(name,p,a){scalarCount++;if(p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
function floats(name,p,a){if(p?.length!==a?.length)throw new Error('Scheduler array shape differs');for(let i=0;i<p.length;i++){floatCount++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite scheduler value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
for(const r of data.records){
 if(r.stage==='pcm'){
  if(context||r.frameStart!==pcmFrames||r.matrix.rows!==2||r.matrix.samples!==64)throw new Error('PCM timeline shape/order differs');
  const encoded=Buffer.from(encodeObservedPcm24(r.matrix.values)),offset=pcmFrames*6;
  if(observedPcm.length<offset+encoded.length||referencePcm.length<offset+encoded.length)throw new Error('PCM window outside WAV');
  for(let i=0;i<encoded.length;i+=3){
   if(encoded.readIntLE(i,3)!==observedPcm.readIntLE(offset+i,3))pcmAlignmentDifferences++;
   if(encoded.readIntLE(i,3)!==referencePcm.readIntLE(offset+i,3)){referencePrefixDifferences++;if(firstReferenceDifferenceFrame===null)firstReferenceDifferenceFrame=pcmFrames+Math.floor(i/6);}
  }
  pcmFrames+=64;continue;
 }
 scalar('event:frameStart',pcmFrames,r.frameStart);
 if(r.stage==='entry'){
  if(context||r.source.rows!==9||r.source.samples!==64||r.before.rows!==3||r.before.samples!==64||r.mode!==1||r.tailSize!==512)throw new Error('Unverified wrapper profile');
  floats('gain',[1,1,0,0],r.gain);
  const stamp=model.timestamp;
  for(let channel=0;channel<9;channel++){model.push(channel,stamp,r.source.values[channel]);pushes++;}
  const computed=model.run();predictedProducts+=computed.products.length;schedules++;
  const head=model.outputs.map((o,row)=>combineConvolutionReadout(computed.readoutBlocks.get(o.fft.object),[],1,r.before.values[row]));
  const write=queue.write(r.source.values);context={state:r.state,head,write,result:null};
 }else if(r.stage==='queue'){
  if(!context||context.state!==r.state||context.result)throw new Error('Unexpected queue stage');
  for(const [name,c,rows] of [['input',r.inputChunk,9],['output',r.outputChunk,3]]){
   scalar(name+':position',context.write.position,c.position);scalar(name+':rows',rows,c.rows);scalar(name+':size',512,c.samples);scalar(name+':rowStride',512,c.rowStride);
  }
  scalar('queue:recycleLimit',512,r.recycleLimit);
  if(lastPartialInput)scalar('input:continuity',lastPartialInput,r.inputChunk.object);
  if(lastPartialOutput)scalar('output:continuity',lastPartialOutput,r.outputChunk.object);
  for(let row=0;row<3;row++)floats('head:output',context.head[row],r.headOutput.values[row]);
  context.result=addQueuedTail64(context.head,r.outputChunk.values);context.input=r.inputChunk;context.output=r.outputChunk;
  if(r.outputChunk.values.some(row=>row.some(v=>v!==0)))tailNonzeroBlocks++;
  for(let i=0;i<64&&firstTailNonzeroFrame===null;i++)if(r.outputChunk.values.some(row=>row[i]!==0))firstTailNonzeroFrame=r.frameStart+i;
 }else if(r.stage==='returned'){
  if(!context?.result||context.state!==r.state||r.output.rows!==3||r.output.samples!==64)throw new Error('Incomplete wrapper');
  for(let row=0;row<3;row++)floats('tail:sum',context.result[row],r.output.values[row]);
  if(context.write.completedChunk){
   inputPackets.push({frameStart:r.frameStart+64-512,endExclusive:r.frameStart+64,channelBits:context.write.completedChunk.map(row=>[...row].map(x=>{view.setFloat32(0,x);return view.getUint32(0);}))});
   scalar('input:next',context.input.next,r.inputAfter?.object??'0x0');scalar('output:next',context.output.next,r.outputAfter?.object??'0x0');
   scalar('input:copyBoundary',null,r.copiedInput);completedInputChecksSkipped++;lastPartialInput=null;lastPartialOutput=null;
  }else{
   if(!r.inputAfter||!r.outputAfter||!r.copiedInput)throw new Error('Partial chunk disappeared');
   scalar('input:after',queue.position,r.inputAfter.position);scalar('output:after',queue.position,r.outputAfter.position);
   scalar('input:identity',context.input.object,r.inputAfter.object);scalar('output:identity',context.output.object,r.outputAfter.object);
   for(let row=0;row<9;row++)floats('input:copy',context.write.written[row],r.copiedInput[row]);
   partialInputChecks++;lastPartialInput=r.inputAfter.object;lastPartialOutput=r.outputAfter.object;
  }
  context=null;outputs++;
 }else throw new Error('Unknown tail queue stage');
}
const consumed=!context&&outputs===128&&pcmFrames===8192&&data.capturedFrames===8192;
const count=floatCount+scalarCount,numericPassed=consumed&&!mismatches;
const report={passed:numericPassed&&!pcmAlignmentDifferences&&!referencePrefixDifferences,numericPassed,count,matched:count-mismatches,floatCount,scalarCount,mismatches,windowComplete:consumed,
 timelineCalibrated:!pcmAlignmentDifferences,pcmPrefixFrames:pcmFrames,pcmAlignmentDifferences,referencePrefixDifferences,firstReferenceDifferenceFrame,
 pushes,schedules,wrapperBlocks:outputs,predictedProducts,partialInputChecks,completedInputChecksSkipped,completedInputChunks:queue.completed,
 tailNonzeroBlocks,firstTailNonzeroFrame,headConfigurationFromEarlierRun:true,silentPrefixSimulated:true,headComputed:true,queueCopyAndTailAdditionComputed:true,
 inputSamplesObserved:true,compiledPlanObserved:true,kernelTimeSamplesObserved:true,kernelSpectraCalculated:true,crossRunKernelInitialization:true,
 tailSamplesStillObserved:true,completedChunkInputCopyNotChecked:true,workerProductionNotComputed:true,existingDestinationStillObserved:true,
 finalStereoFloatStillObserved:true,completeVoiceOrBrowserEquivalence:false,inputPackets,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,inputPackets:undefined}));if(!report.passed)process.exitCode=1;
