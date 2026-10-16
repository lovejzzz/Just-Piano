import fs from 'node:fs';
import {encodeObservedPcm24} from '../dsp/pcm24.mjs';
import {QueuedTailConvolution512} from '../dsp/tail-convolution.mjs';
const [capturePath,reportPath,...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--observed-wav','--reference-wav'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid timeline options');options[args[i]]=args[i+1];}
if(!capturePath||!reportPath||Object.keys(options).length!==2)throw new Error('Usage: capture.json report.json --observed-wav actual.wav --reference-wav official.wav');
function readPcm(path){
 const wav=fs.readFileSync(path);let format,audio;
 if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw new Error('WAV required');
 for(let p=12;p+8<=wav.length;){const n=wav.readUInt32LE(p+4),id=wav.toString('ascii',p,p+4);if(p+8+n>wav.length)throw new Error('Truncated WAV');if(id==='fmt ')format=wav.subarray(p+8,p+8+n);if(id==='data')audio=wav.subarray(p+8,p+8+n);p+=8+n+(n&1);}
 if(!format||format.readUInt16LE(0)!==1||format.readUInt16LE(2)!==2||format.readUInt32LE(4)!==48000||format.readUInt16LE(14)!==24||!audio)throw new Error('Stereo 48kHz PCM24 required');
 return audio;
}
const observedPcm=readPcm(options['--observed-wav']),referencePcm=readPcm(options['--reference-wav']);
let pcmFrames=0,pcmAlignmentDifferences=0,referencePrefixDifferences=0,firstReferenceDifferenceFrame=null;
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(data.schema!==1||!data.windowComplete||data.errors.length||data.minimumFrames!==25600||data.minimumWorkerJobs!==48||data.completionObservation!=='nextWorkerEntry')throw new Error('Complete worker window required');
const packets=[],pending=new Map(),failures=[];let jobs=0,returns=0,pushes=0,count=0,mismatches=0,scalarCount=0;
const banks=new Map();let products=0,nonemptyOutputs=0,kernelSpectra=0;
const available=new Map(),initialChunks=new Set(),inputOffsets=[],consumedGenerations=[];let current=null,initialSlices=0,matchedSlices=0;
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
function floats(name,p,a){if(p.length!==a.length)throw new Error('Worker array shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite worker value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
function scalar(name,p,a){scalarCount++;if(p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
for(const [key,c] of Object.entries(data.plans)){
 if(c.inputs.length!==9||c.kernels.length!==9||c.outputs.length!==3||c.routes.length!==9)throw new Error('Unverified bank512 shape');
 const pipeline=new QueuedTailConvolution512(c),model=pipeline.model;banks.set(key,pipeline);
 for(let row=0;row<c.kernels.length;row++)for(let slot=0;slot<c.kernels[row].slots.length;slot++){
  const native=c.kernels[row].slots[slot];if(!native.empty){floats('kernel:spectrum',model.kernels[row].slots[slot].data,native.data);kernelSpectra++;}
 }
}
if(banks.size!==1)throw new Error('One worker bank required');
for(const r of data.records){
 if(r.stage==='pcm'){
  if(r.frameStart!==pcmFrames||r.matrix.rows!==2||r.matrix.samples!==64)throw new Error('PCM timeline differs');
  const encoded=Buffer.from(encodeObservedPcm24(r.matrix.values)),offset=pcmFrames*6;
  if(observedPcm.length<offset+encoded.length||referencePcm.length<offset+encoded.length)throw new Error('PCM window outside WAV');
  for(let i=0;i<encoded.length;i+=3){
   if(encoded.readIntLE(i,3)!==observedPcm.readIntLE(offset+i,3))pcmAlignmentDifferences++;
   if(encoded.readIntLE(i,3)!==referencePcm.readIntLE(offset+i,3)){referencePrefixDifferences++;if(firstReferenceDifferenceFrame===null)firstReferenceDifferenceFrame=pcmFrames+Math.floor(i/6);}
  }pcmFrames+=64;
 }else if(r.stage==='main'){
  scalar('main:frameStart',pcmFrames,r.frameStart);scalar('main:tailNode',[...banks.keys()][0],r.tailNode);
  if(r.source.rows!==9||r.source.samples!==64)throw new Error('Unverified main input');
  const tail=[...banks.values()][0].process64(r.source.values);
  if(tail.work)packets.push({frameStart:r.frameStart+64-512,rows:tail.work.source,work:tail.work});
  pushes++;
  if(r.position===0){
   if(current&&current.nextPosition!==512)throw new Error('Premature chunk switch');
   const generation=available.get(r.outputChunk);
   if(generation){
    if(generation.consumed)throw new Error('Generation consumed twice');
    generation.consumed=true;consumedGenerations.push(generation.ordinal);inputOffsets.push(r.frameStart-generation.ordinal*512);
    current={object:r.outputChunk,nextPosition:0,rows:generation.rows,generation};
   }else{
    if(r.frameStart>=1024||initialChunks.has(r.outputChunk))throw new Error('Missing worker generation');
    initialChunks.add(r.outputChunk);current={object:r.outputChunk,nextPosition:0,rows:null};
   }
  }
  if(!current||current.object!==r.outputChunk||current.nextPosition!==r.position)throw new Error('Consumption chunk identity/position differs');
  scalar('consumer:generation',current.generation?.ordinal??null,tail.generation);scalar('consumer:position',r.position,tail.position);
  for(let row=0;row<3;row++)floats('consumer:scheduledSlice',tail.output[row],r.values[row]);
  if(current.rows)matchedSlices++;else initialSlices++;
  current.nextPosition+=64;if(current.generation&&current.nextPosition===512)current.generation.fullyConsumed=true;

 }else if(r.stage==='worker'){
  if(r.ordinal!==jobs||pending.has(r.thread)||!packets[jobs]||r.source.rows!==9||r.source.samples!==512||r.mode!==0)throw new Error('Unverified worker chronology/shape');
  scalar('worker:clock',jobs*512,r.time);
  for(let row=0;row<9;row++)floats(`${jobs}:${row}:packet`,packets[jobs].rows[row],r.source.values[row]);
  if(BigInt(r.targetMatrix)-8n!==BigInt(r.targetChunk))throw new Error('Target is not chunk matrix');
  const old=available.get(r.targetChunk);if(old&&!old.fullyConsumed)throw new Error('Overwrite of unconsumed generation');
  if(!banks.has(r.node))throw new Error('Missing worker bank');
  const work=packets[jobs].work;scalar('work:ordinal',jobs,work.ordinal);
  products+=work.products;nonemptyOutputs+=work.nonemptyOutputs;
  const rows=work.output;
  const generation={ordinal:jobs,rows,consumed:false,resultChecked:false};available.set(r.targetChunk,generation);
  pending.set(r.thread,{ordinal:jobs,node:r.node,generation});jobs++;
 }else if(r.stage==='completed'){
  const p=pending.get(r.thread);if(!p||p.ordinal!==r.ordinal||p.node!==r.node||r.output.rows!==3||r.output.samples!==512)throw new Error('Unpaired worker result');
  scalar('worker:completionClock',(r.ordinal+1)*512,r.time);
  for(let row=0;row<3;row++)floats('worker:output',p.generation.rows[row],r.output.values[row]);
  p.generation.resultChecked=true;pending.delete(r.thread);returns++;
 }else throw new Error('Unknown worker stage');
}
const complete=jobs===data.workerEntries&&returns===data.workerResultsObserved&&jobs===48&&!pending.size&&pcmFrames===data.capturedFrames&&pcmFrames===25600;
const completeConsumption=initialChunks.size===2&&initialSlices===16&&matchedSlices===384&&consumedGenerations.length===48&&consumedGenerations.every((x,i)=>x===i)&&inputOffsets.every(x=>x===1024)&&current?.nextPosition===512&&[...available.values()].every(g=>g.fullyConsumed&&g.resultChecked);
const report={passed:completeConsumption&&complete&&!mismatches&&!pcmAlignmentDifferences&&!referencePrefixDifferences,count:count+scalarCount,matched:count+scalarCount-mismatches,
 floatCount:count,scalarCount,mismatches,windowComplete:complete,pcmPrefixFrames:pcmFrames,timelineCalibrated:!pcmAlignmentDifferences,
 pcmAlignmentDifferences,referencePrefixDifferences,firstReferenceDifferenceFrame,pushes,computedPackets:packets.length,unobservedFuturePackets:packets.length-jobs,workerEntries:jobs,workerResultsObserved:returns,
 completedPacketSamplesCompared:jobs*9*512,last64FrameBoundarySamplesCompared:jobs*9*64,initialChunks:initialChunks.size,initialSlices,matchedSlices,consumedGenerations,inputOffsets,completeConsumption,products,nonemptyOutputs,kernelSpectra,workerOutputSamplesCompared:jobs*3*512,consumerSamplesCompared:matchedSlices*3*64,
 mainSourceSamplesObserved:true,workerInputsFromComputedPackets:true,kernelTimeSamplesObserved:true,compiledPlanObserved:true,kernelSpectraCalculated:true,workerConvolutionComputed:true,consumerUsesCalculatedWorkerOutput:true,causal64FrameProcessorUsed:true,finalStereoFloatStillObserved:true,
 completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
