import fs from 'node:fs';
import {forwardReal128} from '../dsp/real-fft-finalize.mjs';
import {inverseReal128} from '../dsp/real-fft-inverse.mjs';
import {accumulatePackedRealSpectrum} from '../dsp/packed-convolution-product.mjs';
import {normalizedOverlap128} from '../dsp/convolution-overlap.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(data.schema!==4||data.threadIndexFilter!==1||data.overlapLimit!==129||data.inverseInputCaptured!==false||!data.windowComplete||data.errors.length)throw new Error('Complete main-thread 129-block convolution window required');
if(!data.records.length||data.records.some(r=>!Number.isSafeInteger(r.thread))||new Set(data.records.map(r=>r.thread)).size!==1)throw new Error('Unverified convolution thread coverage');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const frequency=new Map(),accumulators=new Map(),invalid=new Set(),dirty=new Set(),history=new Map(),pending=new Map();
const failures=[],outputs=[];
let count=0,mismatches=0,products=0,forwards=0,inverses=0,overlaps=0,resets=0;
function check(name,p,a){if(p.length!==a.length)throw new Error('Convolution shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite convolution value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
for(const r of data.records){
 if(r.stage==='fftEntry'){
  if(r.direction===0){frequency.set(r.buffer,forwardReal128(r.input));forwards++;}
  else throw new Error('Unverified FFT direction');
 }else if(r.stage==='product'){
  if(r.ordinal!==products||r.a.empty||r.b.empty||r.destination.empty)throw new Error('Unverified product chronology');
  const key=r.destination.buffer,a=frequency.get(r.a.buffer),b=frequency.get(r.b.buffer);
  if(key===r.a.buffer||key===r.b.buffer)throw new Error('Aliased product not covered');
  if(!a||!b)throw new Error('Calculated forward spectrum missing');
  check(`${products}:a`,a,r.a.data);check(`${products}:b`,b,r.b.data);
  if(!accumulators.has(key)||invalid.has(key)){accumulators.set(key,new Float32Array(128));invalid.delete(key);resets++;}
  const accumulator=accumulators.get(key);check(`${products}:before`,accumulator,r.destination.data);dirty.delete(key);
  accumulatePackedRealSpectrum(a,b,accumulator,r.scale);dirty.add(key);products++;
 }else if(r.stage==='overlap'){
  if(pending.has(r.thread)||r.ordinal!==overlaps)throw new Error('Unverified overlap chronology');
  if(!accumulators.has(r.buffer)||invalid.has(r.buffer))throw new Error('Calculated inverse spectrum missing');
  const inverse=inverseReal128(accumulators.get(r.buffer));
  dirty.delete(r.buffer);invalid.add(r.buffer);frequency.delete(r.buffer);inverses++;
  const old=history.get(r.object)??new Float32Array(64);
  check(`${overlaps}:inverse`,inverse,r.inverse);check(`${overlaps}:history`,old,r.oldTail);check(`${overlaps}:before`,old,r.before);
  pending.set(r.thread,{object:r.object,...normalizedOverlap128(inverse,old)});
 }else if(r.stage==='overlapReturn'){
  const p=pending.get(r.thread);if(!p||p.object!==r.object||r.ordinal!==overlaps)throw new Error('Unpaired overlap return');
  check(`${overlaps}:output`,p.output,r.output);check(`${overlaps}:tail`,p.tail,r.tail);
  history.set(r.object,p.tail);pending.delete(r.thread);outputs.push({ordinal:overlaps,object:r.object,output:[...p.output]});overlaps++;
 }else throw new Error('Unknown convolution stage');
}
const consumed=products===data.productCount&&overlaps===data.overlapCount&&overlaps>=data.overlapLimit&&!pending.size&&!dirty.size;
const report={passed:consumed&&!mismatches,count,matched:count-mismatches,mismatches,windowComplete:consumed,captureWindowComplete:data.windowComplete,
 unconsumedAccumulatorBuffers:dirty.size,pendingOverlapReturns:pending.size,products,forwards,inverses,overlaps,resets,historyObjects:history.size,
 spectralSourcesCalculated:true,inverseAndOverlapComputed:true,initialHistoryRequiredZero:true,allAccumulationsCheckedAtReuseOrInverseOutput:consumed,
 timeInputsAndImpulseResponsesStillObserved:true,completeVoiceOrBrowserEquivalence:false,outputs,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,outputs:undefined}));if(!report.passed)process.exitCode=1;
