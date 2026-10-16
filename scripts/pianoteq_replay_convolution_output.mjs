import fs from 'node:fs';
import crypto from 'node:crypto';
import {encodeObservedPcm24} from '../dsp/pcm24.mjs';
import {PartitionedConvolution64} from '../dsp/partitioned-convolution.mjs';
const [capturePath,reportPath,...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--kernel-time-inputs','--observed-wav','--reference-wav'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid timeline options');options[args[i]]=args[i+1];}
if(!capturePath||!reportPath||Object.keys(options).length!==3)throw new Error('Usage: capture.json report.json --kernel-time-inputs kernels.json --observed-wav actual.wav --reference-wav official.wav');
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
const frameSpans=new Map();
const captureBytes=fs.readFileSync(capturePath),data=JSON.parse(captureBytes),kernelEvidence=JSON.parse(fs.readFileSync(kernelPath,'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(kernelEvidence.schema!==1||kernelEvidence.crossRunInitialization!==true||kernelEvidence.targetSha256!==sha(captureBytes)||kernelEvidence.sourceSha256!==sha(fs.readFileSync(kernelEvidence.sourceCapture)))throw new Error('Kernel evidence binding differs');
if(data.schema!==2||data.threadIndexFilter!==1||data.minimumFrames!==8192||!data.windowComplete||data.errors.length)throw new Error('Complete scheduler window required');
const kernelView=new DataView(new ArrayBuffer(4));
const banks=new Map(Object.entries(data.configs).map(([key,c])=>{
 const kernels=c.kernels.map(r=>r&&({...r,slots:r.slots.map(s=>{
  if(s.empty)return s;
  const source=kernelEvidence.kernels[key]?.[s.object];if(source?.inputBits.length!==128)throw new Error('Kernel time producer missing');
  const timeInput=Float32Array.from(source.inputBits,bits=>{kernelView.setUint32(0,bits);return kernelView.getFloat32(0);});
  return {...s,timeInput};
 })}));
 return [key,{model:new PartitionedConvolution64({...c,kernels}),products:[],outputs:new Map()}];
}));
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const failures=[];let floatCount=0,scalarCount=0,mismatches=0,pushes=0,schedules=0,products=0,outputs=0,predictedProducts=0;
function scalar(name,p,a){scalarCount++;if(p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
function floats(name,p,a){if(p?.length!==a?.length)throw new Error('Scheduler array shape differs');for(let i=0;i<p.length;i++){floatCount++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite scheduler value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
function state(name,p,a){for(const key of ['object','buffer','empty','content','timestamp'])scalar(`${name}:${key}`,p[key],a[key]);}
for(const [key,c] of Object.entries(data.configs))for(let j=0;j<c.kernels.length;j++){
 const r=c.kernels[j];if(r)for(let k=0;k<r.slots.length;k++)if(!r.slots[k].empty)floats('initial:kernel',banks.get(key).model.kernels[j].slots[k].data,r.slots[k].data);
}
for(const r of data.records){
 if(r.stage==='pcm'){
  if(r.frameStart!==pcmFrames||r.matrix.rows!==2||r.matrix.samples!==64)throw new Error('PCM timeline shape/order differs');
  const encoded=Buffer.from(encodeObservedPcm24(r.matrix.values)),offset=pcmFrames*6;
  if(observedPcm.length<offset+encoded.length||referencePcm.length<offset+encoded.length)throw new Error('PCM window outside WAV');
  for(let i=0;i<encoded.length;i+=3){
   if(encoded.readIntLE(i,3)!==observedPcm.readIntLE(offset+i,3))pcmAlignmentDifferences++;
   if(encoded.readIntLE(i,3)!==referencePcm.readIntLE(offset+i,3)){referencePrefixDifferences++;if(firstReferenceDifferenceFrame===null)firstReferenceDifferenceFrame=pcmFrames+Math.floor(i/6);}
  }
  pcmFrames+=64;continue;
 }
 if(r.stage==='product'){products++;continue;}
 scalar('event:frameStart',pcmFrames,r.frameStart);
 const b=banks.get(r.bank);if(!b)throw new Error('Unknown convolution bank');
 if(r.stage==='push'){
  if(b.outputs.size)throw new Error('Unconsumed block before push');
  if(!frameSpans.has(r.bank))frameSpans.set(r.bank,{offset:r.frameStart-r.timestamp,firstInputFrame:r.frameStart,lastInputFrame:r.frameStart,firstOutputFrame:null,lastOutputFrame:null});
  const span=frameSpans.get(r.bank);scalar('input:clockLink',span.offset+r.timestamp,r.frameStart);span.lastInputFrame=r.frameStart;
  scalar('push:step',0,r.step);const before=b.model.push(r.channel,r.timestamp,r.input);
  // push() advances the cursor; before identifies the independently selected old slot.
  scalar('push:cursor',(b.model.inputs[r.channel].cursor+b.model.inputs[r.channel].slots.length-1)%b.model.inputs[r.channel].slots.length,r.cursor);
  state('push:before',before,r.before);pushes++;
  if(b.model.nextChannel===0){const computed=b.model.run();predictedProducts+=computed.products.length;b.outputs=computed.outputs;schedules++;}
 }else if(r.stage==='output'){

  const p=b.outputs.get(r.fft.object);if(!p||r.ordinal!==outputs)throw new Error('Unexpected output selection');
  const descriptor=b.model.outputs.find(o=>o?.fft.object===p.object).fft;
  state('output:fft',{...descriptor,empty:0,content:1},r.fft);floats('output:inverse',p.inverse,r.fft.data);
  floats('output:result',p.output,r.output);floats('output:tail',p.tail,r.tail);b.outputs.delete(p.object);outputs++;
  const span=frameSpans.get(r.bank);span.firstOutputFrame??=r.frameStart;span.lastOutputFrame=r.frameStart;
 }else throw new Error('Unknown scheduler stage');
}
const consumed=banks.size>0&&outputs>=129&&outputs===data.outputCount&&pcmFrames===data.capturedFrames&&pcmFrames>=data.minimumFrames&&[...banks.values()].every(b=>!b.outputs.size);
const count=floatCount+scalarCount;
const numericPassed=consumed&&!mismatches;
const report={passed:numericPassed&&!pcmAlignmentDifferences&&!referencePrefixDifferences,numericPassed,count,matched:count-mismatches,floatCount,scalarCount,mismatches,windowComplete:consumed,
 timelineCalibrated:!pcmAlignmentDifferences,pcmPrefixFrames:pcmFrames,pcmPrefixSamplesCompared:pcmFrames*2,pcmAlignmentDifferences,
 referencePrefixDifferences,firstReferenceDifferenceFrame,finalStereoFloatStillObserved:true,frameSpans:Object.fromEntries(frameSpans),validationProfile:'output-only',intermediateProductEventsCompared:false,observedProductEventsIgnored:products,predictedProducts,banks:banks.size,pushes,schedules,outputs,inputCopiesAndFftsComputed:true,ringCursorsAndSelectionsComputed:true,inverseAndOverlapComputed:true,
 inputSamplesObserved:true,compiledPlanObserved:true,kernelTimeSamplesObserved:true,kernelSpectraCalculated:true,crossRunKernelInitialization:true,
 completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
