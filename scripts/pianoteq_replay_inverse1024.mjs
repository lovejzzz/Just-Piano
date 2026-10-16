import fs from 'node:fs';
import {encodeObservedPcm24} from '../dsp/pcm24.mjs';
import {inverseReal1024} from '../dsp/real-fft-1024.mjs';
import {normalizedOverlap1024} from '../dsp/convolution-overlap.mjs';
import {buildReal1024Coefficients} from '../dsp/real-fft-coefficients.mjs';
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
if(data.schema!==1||!data.windowComplete||data.errors.length||data.calls!==144||data.minimumInverses!==128||data.inverses<128)throw new Error('Complete inverse1024 window required');
const pending=new Map(),history=new Map(),failures=[];let calls=0,returns=0,transforms=0,count=0,mismatches=0,scalarCount=0,emptyCalls=0,unusedLocationsWithNonzeroBits=0;
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
function floats(name,p,a){if(p.length!==a.length)throw new Error('Worker array shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite worker value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
function scalar(name,p,a){scalarCount++;if(p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
const coefficients=buildReal1024Coefficients();
for(const plan of Object.values(data.plans)){
 const words=[1024,128,256,4,4,4,4,4];
 if(plan.words.length!==28||plan.words.some((x,i)=>x!==(words[i]??0))||plan.twiddleBits.length!==256)throw new Error('Unverified inverse FFT plan');
 floats('coefficients:e',coefficients.e,plan.e);
 for(let i=0;i<256;i++){
  if(!coefficients.usedTwiddle[i]){if(plan.twiddleBits[i]!==0)unusedLocationsWithNonzeroBits++;continue;}
  view.setUint32(0,plan.twiddleBits[i]);floats('coefficients:twiddle',[coefficients.twiddle[i]],[view.getFloat32(0)]);
 }
}
for(const r of data.records){
 if(r.stage==='pcm'){
  if(r.frameStart!==pcmFrames||r.matrix.rows!==2||r.matrix.samples!==64)throw new Error('PCM timeline differs');
  const encoded=Buffer.from(encodeObservedPcm24(r.matrix.values)),offset=pcmFrames*6;
  if(observedPcm.length<offset+encoded.length||referencePcm.length<offset+encoded.length)throw new Error('PCM window outside WAV');
  for(let i=0;i<encoded.length;i+=3){
   if(encoded.readIntLE(i,3)!==observedPcm.readIntLE(offset+i,3))pcmAlignmentDifferences++;
   if(encoded.readIntLE(i,3)!==referencePcm.readIntLE(offset+i,3)){referencePrefixDifferences++;if(firstReferenceDifferenceFrame===null)firstReferenceDifferenceFrame=pcmFrames+Math.floor(i/6);}
  }pcmFrames+=64;
 }else if(r.stage==='entry'){
  if(r.ordinal!==calls||pending.size>=3||!data.plans[r.plan]||r.channel!==calls%3||![0,1].includes(r.empty))throw new Error('Invalid inverse entry');
  scalar('worker:clock',Math.floor(calls/3)*512,r.time);
  const old=history.get(r.object)??new Float32Array(512);floats('history:before',old,r.oldTail);
  let inverse=null,result;
  if(!r.empty){
   scalar('spectrum:content',0,r.content);inverse=inverseReal1024(r.input);result=normalizedOverlap1024(inverse,old);transforms++;
  }else {result={output:old.slice(),tail:new Float32Array(512)};emptyCalls++;}
  pending.set(`${r.thread}:${calls}`,{ordinal:calls,object:r.object,inverse,...result});calls++;
 }else if(r.stage==='returned'){
  const key=`${r.thread}:${r.ordinal}`,c=pending.get(key);if(r.ordinal!==returns||!c||c.ordinal!==r.ordinal||c.object!==r.object)throw new Error('Unpaired inverse return');
  if(c.inverse)floats('inverse:raw',c.inverse,r.inverse);
  floats('overlap:output',c.output,r.output);floats('overlap:tail',c.tail,r.tail);
  history.set(r.object,c.tail);pending.delete(key);returns++;
 }else throw new Error('Unknown inverse stage');
}
const complete=calls%3===0&&pcmFrames>=8192&&calls===data.calls&&returns===data.returns&&transforms===data.inverses&&transforms>=128&&!pending.size&&pcmFrames===data.capturedFrames;
const report={passed:complete&&!mismatches&&!pcmAlignmentDifferences&&!referencePrefixDifferences,count:count+scalarCount,matched:count+scalarCount-mismatches,
 floatCount:count,scalarCount,mismatches,windowComplete:complete,pcmPrefixFrames:pcmFrames,timelineCalibrated:!pcmAlignmentDifferences,
 pcmAlignmentDifferences,referencePrefixDifferences,firstReferenceDifferenceFrame,calls,returns,transforms,emptyCalls,historyObjects:history.size,
 unusedLocationsWithNonzeroBits,unnormalizedInverseComputed:true,overlapAndNormalizationComputed:true,initialHistoryRequiredZero:true,
 coefficientsGenerated:true,inputSpectrumStillObserved:true,finalStereoFloatStillObserved:true,completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
