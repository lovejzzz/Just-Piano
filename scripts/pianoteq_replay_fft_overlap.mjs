import fs from 'node:fs';
import {inverseReal128} from '../dsp/real-fft-inverse.mjs';
import {normalizedOverlap128} from '../dsp/convolution-overlap.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(!data.windowComplete||data.errors.length)throw new Error('Complete overlap window required');
const inverseReturnCaptured=data.schema===1?true:data.schema===2&&data.inverseReturnCaptured===false?false:null;
if(inverseReturnCaptured===null)throw new Error('Unverified overlap schema');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const fftPending=new Map(),time=new Map(),pending=new Map(),history=new Map(),failures=[];
let count=0,mismatches=0,transforms=0,overlaps=0;
function check(name,p,a){if(p.length!==a.length)throw new Error('Overlap shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite overlap value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
for(const r of data.records){
 if(r.stage==='fftEntry'){
  if(r.direction!==1||fftPending.has(r.thread))throw new Error('Unverified inverse chronology');
  const output=inverseReal128(r.input);
  if(inverseReturnCaptured)fftPending.set(r.thread,{buffer:r.buffer,output});
  else {time.set(r.buffer,output);transforms++;}
 }else if(r.stage==='fftReturn'){
  const p=fftPending.get(r.thread);if(!p||p.buffer!==r.buffer||r.direction!==1)throw new Error('Unpaired inverse');
  check(`inverse:${transforms}`,p.output,r.output);time.set(r.buffer,p.output);fftPending.delete(r.thread);transforms++;
 }else if(r.stage==='overlap'){
  if(pending.has(r.thread)||r.ordinal!==overlaps)throw new Error('Unverified overlap chronology');
  const inverse=time.get(r.buffer);if(!inverse)throw new Error('Calculated inverse source missing');
  const old=history.get(r.object)??new Float32Array(64);
  check(`${overlaps}:inverse`,inverse,r.inverse);check(`${overlaps}:history`,old,r.oldTail);check(`${overlaps}:before`,old,r.before);
  pending.set(r.thread,{object:r.object,...normalizedOverlap128(inverse,old)});time.delete(r.buffer);
 }else if(r.stage==='overlapReturn'){
  const p=pending.get(r.thread);if(!p||p.object!==r.object||r.ordinal!==overlaps)throw new Error('Unpaired overlap');
  check(`${overlaps}:output`,p.output,r.output);check(`${overlaps}:tail`,p.tail,r.tail);
  history.set(r.object,p.tail);pending.delete(r.thread);overlaps++;
 }else throw new Error('Unknown overlap stage');
}
if(overlaps!==data.overlapLimit||pending.size||fftPending.size)throw new Error('Incomplete overlap window');
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,transforms,overlaps,historyObjects:history.size,
 inverseAndOverlapComputed:true,initialHistoryRequiredZero:true,inputSpectrumStillObserved:true,completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
