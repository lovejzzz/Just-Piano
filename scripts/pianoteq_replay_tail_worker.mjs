import fs from 'node:fs';
import {encodeObservedPcm24} from '../dsp/pcm24.mjs';
import {TailInputQueue512} from '../dsp/tail-queue.mjs';
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
if(data.schema!==1||!data.windowComplete||data.errors.length||data.minimumFrames!==8192||data.minimumWorkerJobs!==16)throw new Error('Complete worker window required');
const queue=new TailInputQueue512(),packets=[],pending=new Map(),failures=[];let jobs=0,returns=0,pushes=0,count=0,mismatches=0,scalarCount=0;
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
function floats(name,p,a){if(p.length!==a.length)throw new Error('Worker array shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite worker value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
function scalar(name,p,a){scalarCount++;if(p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
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
  scalar('main:frameStart',pcmFrames,r.frameStart);floats('main:gain',[1,1,0,0],r.gain);
  if(r.source.rows!==9||r.source.samples!==64)throw new Error('Unverified main input');
  const write=queue.write(r.source.values);if(write.completedChunk)packets.push({frameStart:r.frameStart+64-512,rows:write.completedChunk});pushes++;
 }else if(r.stage==='worker'){
  if(r.ordinal!==jobs||pending.has(r.thread)||!packets[jobs]||r.source.rows!==9||r.source.samples!==512||r.mode!==0)throw new Error('Unverified worker chronology/shape');
  scalar('worker:clock',jobs*512,r.time);
  for(let row=0;row<9;row++)floats(`${jobs}:${row}:packet`,packets[jobs].rows[row],r.source.values[row]);
  pending.set(r.thread,{ordinal:jobs,node:r.node});jobs++;
 }else if(r.stage==='returned'){
  const p=pending.get(r.thread);if(!p||p.ordinal!==r.ordinal||p.node!==r.node||r.output.rows!==3||r.output.samples!==512)throw new Error('Unpaired worker result');
  scalar('worker:returnClock',(r.ordinal+1)*512,r.time);pending.delete(r.thread);returns++;
 }else throw new Error('Unknown worker stage');
}
const complete=jobs===data.workerEntries&&returns===data.workerReturns&&jobs>=16&&!pending.size&&pcmFrames===data.capturedFrames&&pcmFrames>=8192;
const report={passed:complete&&!mismatches&&!pcmAlignmentDifferences&&!referencePrefixDifferences,count:count+scalarCount,matched:count+scalarCount-mismatches,
 floatCount:count,scalarCount,mismatches,windowComplete:complete,pcmPrefixFrames:pcmFrames,timelineCalibrated:!pcmAlignmentDifferences,
 pcmAlignmentDifferences,referencePrefixDifferences,firstReferenceDifferenceFrame,pushes,computedPackets:packets.length,workerEntries:jobs,workerReturns:returns,
 completedPacketSamplesCompared:jobs*9*512,last64FrameBoundarySamplesCompared:jobs*9*64,workerOutputStillObserved:true,workerConvolutionNotComputed:true,
 completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
