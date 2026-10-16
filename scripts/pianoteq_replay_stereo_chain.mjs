import fs from 'node:fs';
import crypto from 'node:crypto';
import {DryStereoPost64} from '../dsp/dry-stereo-post.mjs';
import {encodeObservedPcm24} from '../dsp/pcm24.mjs';
import {GlobalRoutedMix64} from '../dsp/global-routed-mix.mjs';
import {CabinetConvolution64} from '../dsp/cabinet-convolution.mjs';
const [capturePath,reportPath,...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--observed-wav','--reference-wav','--output-wav'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid stereo options');options[args[i]]=args[i+1];}
if(!capturePath||!reportPath||!options['--observed-wav']||!options['--reference-wav'])throw new Error('Usage: capture.json report.json --observed-wav actual.wav --reference-wav official.wav [--output-wav calculated.wav]');
function readPcm(path){
 const wav=fs.readFileSync(path);let format,audio;
 if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw new Error('WAV required');
 for(let p=12;p+8<=wav.length;){const n=wav.readUInt32LE(p+4),id=wav.toString('ascii',p,p+4);if(p+8+n>wav.length)throw new Error('Truncated WAV');if(id==='fmt ')format=wav.subarray(p+8,p+8+n);if(id==='data')audio=wav.subarray(p+8,p+8+n);p+=8+n+(n&1);}
 if(!format||format.readUInt16LE(0)!==1||format.readUInt16LE(2)!==2||format.readUInt32LE(4)!==48000||format.readUInt16LE(14)!==24||!audio)throw new Error('Stereo 48kHz PCM24 required');return audio;
}
const observedPcm=readPcm(options['--observed-wav']),referencePcm=readPcm(options['--reference-wav']),parts=[];
let pcmCalibrationDifferences=0;
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(data.schema!==1||!data.globalRouteBoundary||!data.globalPcmObserved||!data.windowComplete||data.errors.length||data.minimumWrapperBlocks!==1768||data.wrapperBlocks!==1768||data.wrapperLocalFrames!==113152)throw new Error('Complete 1768-block cabinet window required');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const failures=[];let count=0,scalarCount=0,mismatches=0,blocks=0,context=null,routed=null,headProducts=0,tailProducts=0,headNonemptyOutputs=0,tailNonemptyOutputs=0,kernelSpectra=0,activeRowGateBlocks=0;
function floats(name,p,a){if(p?.length!==a?.length)throw new Error('Cabinet array shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite cabinet value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
function scalar(name,p,a){scalarCount++;if(p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
const entries=Object.entries(data.configs);if(entries.length!==1)throw new Error('One cabinet configuration required');
const [state,c]=entries[0],model=new CabinetConvolution64(c.head.configuration,c.tail.configuration),post=new DryStereoPost64(c.post);
for(const [name,bank] of [['head',model.head],['tail',model.tail.model]]){
 const config=c[name].configuration;
 if(config.inputs.length!==9||config.kernels.length!==9||config.outputs.length!==3||config.routes.length!==9)throw new Error('Unverified cabinet bank shape');
 for(let row=0;row<9;row++)for(let slot=0;slot<config.kernels[row].slots.length;slot++){
  const native=config.kernels[row].slots[slot];if(!native.empty){floats(`${name}:kernel`,bank.kernels[row].slots[slot].data,native.data);kernelSpectra++;}
 }
}
const first=data.records[0];if(first.stage!=='global'||first.gain!==1)throw new Error('Initial global route required');
const table=JSON.stringify(first.entries),from=x=>{view.setUint32(0,x);return view.getFloat32(0);};
const routes=first.entries.map(e=>({...e,taps:Array.from({length:e.tapWords.length/6},(_,i)=>{
 const w=e.tapWords.slice(i*6,i*6+6).map(from);return {delay:w[0],startGain:w[1],endGain:w[2],multiplier:w[4]};
})}));
const globalMix=new GlobalRoutedMix64(first.cache,routes,!!first.wrap);
function cacheMetadata(actual){
 const cache=globalMix.cache;
 if(cache.sampleRate!==actual.sampleRate||cache.maximumDelay!==actual.maximumDelay||cache.rings.length!==actual.rings.length)throw new Error('Global cache layout differs');
 for(let i=0;i<cache.rings.length;i++){
  const p=cache.rings[i],a=actual.rings[i];
  if(['head','total','smallChunk','bigChunk'].some(k=>p[k]!==a[k])||p.flags.length!==a.flags.length||p.flags.some((x,j)=>x!==a.flags[j]))throw new Error('Global cache state differs');
 }
}
for(const r of data.records){
 scalar('frameStart',blocks*64,r.frameStart);
 if(r.stage==='global'){
  if(context||routed||r.R!==first.R||r.S!==first.S||r.gain!==1||r.wrap!==first.wrap||JSON.stringify(r.entries)!==table||r.input.rows!==2||r.input.samples!==64||r.sumInput.rows!==3||r.sumInput.samples!==64)throw new Error('Invalid global route');
  if(r.gateEnabled)activeRowGateBlocks++;
  cacheMetadata(r.cache);routed={thread:r.thread,...globalMix.process64(r.input.values,r.sumInput.values,r.gateEnabled,r.rowFlags)};
 }else if(r.stage==='entry'){
  if(r.state!==state||!routed||routed.thread!==r.thread)throw new Error('Cabinet not preceded by global route');
  if(context||r.source.rows!==9||r.source.samples!==64||r.before.rows!==3||r.before.samples!==64||r.mode!==1)throw new Error('Invalid cabinet entry');
  floats('gain',[1,1,0,0],r.gain);
  for(let row=0;row<3;row++)floats('global:beforeCabinet',routed.output[row],r.before.values[row]);
  const computed=model.process64(r.source.values,routed.output,r.mode);
  headProducts+=computed.headProducts;headNonemptyOutputs+=computed.headNonemptyOutputs;
  if(computed.tailWork){tailProducts+=computed.tailWork.products;tailNonemptyOutputs+=computed.tailWork.nonemptyOutputs;}
  if(r.auxiliary.rows!==3||r.auxiliary.samples!==64)throw new Error('Invalid auxiliary matrix');
  context={thread:r.thread,computed,post:post.process64(computed.output,r.auxiliary.values)};
 }else if(r.stage==='pcm'){
  if(r.state!==state||!context||context.thread!==r.thread||r.output.rows!==2||r.output.samples!==64)throw new Error('Invalid cabinet return');
  floats('level:state',c.post.level,r.level);
  for(let row=0;row<2;row++)floats('stereo:final',context.post.output[row],r.output.values[row]);
  parts.push(Buffer.from(encodeObservedPcm24(context.post.output)));
  const nativeEncoded=Buffer.from(encodeObservedPcm24(r.output.values)),offset=blocks*64*6;
  if(offset+nativeEncoded.length>observedPcm.length)throw new Error('PCM observation beyond WAV');
  for(let i=0;i<nativeEncoded.length;i+=3)if(nativeEncoded.readIntLE(i,3)!==observedPcm.readIntLE(offset+i,3))pcmCalibrationDifferences++;

  context=null;routed=null;blocks++;
 }else throw new Error('Unknown cabinet stage');
}
const complete=blocks===1768&&!context&&!routed&&data.records.length===5304;
const pcm=Buffer.concat(parts);
if(pcm.length!==observedPcm.length||pcm.length!==referencePcm.length)throw new Error('Full PCM lengths differ');
let pcmDifferences=0,referencePcmDifferences=0,firstPcmDifferenceFrame=null;
for(let i=0;i<pcm.length;i+=3){
 if(pcm.readIntLE(i,3)!==observedPcm.readIntLE(i,3)){pcmDifferences++;if(firstPcmDifferenceFrame===null)firstPcmDifferenceFrame=Math.floor(i/6);}
 if(pcm.readIntLE(i,3)!==referencePcm.readIntLE(i,3))referencePcmDifferences++;
}
if(options['--output-wav']){
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(288000,28);header.writeUInt16LE(6,32);header.writeUInt16LE(24,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);fs.writeFileSync(options['--output-wav'],Buffer.concat([header,pcm]));
}
const report={passed:complete&&!mismatches&&!pcmDifferences&&!referencePcmDifferences&&!pcmCalibrationDifferences,count:count+scalarCount,matched:count+scalarCount-mismatches,floatCount:count,scalarCount,mismatches,
 windowComplete:complete,wrapperBlocks:blocks,wrapperLocalFrames:blocks*64,kernelSpectra,headProducts,headNonemptyOutputs,tailProducts,tailNonemptyOutputs,
 headAndTailComputed:true,outerAdditionComputed:true,irTimeSamplesObserved:true,compiledPlansObserved:true,sourceSamplesObserved:true,existingDestinationComputed:true,globalRouteInputObserved:true,globalSumInputObserved:true,globalCacheStateCarried:true,preCabinetRowMaskComputed:true,activeRowGateBlocks,activeRowGateNotDynamicallyVerified:true,
 fullPcmFrames:pcm.length/6,pcmDifferences,referencePcmDifferences,pcmCalibrationDifferences,firstPcmDifferenceFrame,pcmSha256:crypto.createHash('sha256').update(pcm).digest('hex'),
 fullPostConvolutionStereoComputed:true,inactiveEffectsProfileOnly:true,auxiliarySamplesObserved:true,postControlsFromSameRun:true,outputWavGenerated:!!options['--output-wav'],completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
