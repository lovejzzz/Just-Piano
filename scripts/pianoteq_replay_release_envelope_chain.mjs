import fs from 'node:fs';
import {ReleaseProgressEnvelope} from '../dsp/release-progress-envelope.mjs';
import {repeatedStrikeControl} from '../dsp/repeated-strike-control.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(data.schema!==1||data.fixedSites!==true||!data.complete||data.activeSites!==0||data.errors.length||data.starts!==5||!data.envelopeBlocks)throw new Error('Complete four-site envelope/strike capture required');
const bitsView=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite envelope/control');bitsView.setFloat32(0,x);return bitsView.getUint32(0);};
const voices=new Map(),envelopes=new Map(),failures=[];let count=0,mismatches=0,starts=0,blocks=0,oldReleasesComputed=0,copies=0,integerCount=0;
const oldReleaseReads=[],copyLeadHistogram={};
const progress=new Map(),inflightVoices=new Set(),copied=new Map(),predictions=new Map(),producerChecks=new Set();
function compare(name,p,a,integer=false){count++;if(integer)integerCount++;if(integer?p!==a:bits(p)!==bits(a)){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
const address=s=>{if(!/^0x[0-9a-f]+$/.test(s))throw new Error('Invalid object address');return BigInt(s);};
for(const [index,r] of data.records.entries()){
 if(r.stage==='before'){
  if(r.ordinal!==starts||voices.has(r.newVoice)||r.note!==69)throw new Error('Invalid strike chronology');
  voices.set(r.newVoice,{ordinal:starts,thread:r.thread});
  const inputs=structuredClone(r.inputs);
  if(inputs.old){
   if(!copied.has(r.oldVoice))throw new Error('Old release requires prior explicit copy commit');
   const source=copied.get(r.oldVoice);compare('old-release:copy',source.value,inputs.old.release);inputs.old.release=source.value;oldReleasesComputed++;oldReleaseReads.push({ordinal:starts,oldCount:inputs.old.count,...source});
  }else if(r.oldVoice!=='0x0')throw new Error('Unbound absent old voice');
  predictions.set(r.newVoice,repeatedStrikeControl(inputs));starts++;
 }else if(r.stage==='copy'){
  if(!voices.has(r.voice)||!envelopes.has(r.voice)||inflightVoices.has(r.voice))throw new Error('Copy requires completed envelope state');
  const value=envelopes.get(r.voice).position;
  compare('copy:modal',value,r.modalPosition);compare('copy:voice',value,r.release);copied.set(r.voice,{value,copyCounter:r.counter,modalCounter:envelopes.get(r.voice).samplesProcessed});copies++;
  const lead=envelopes.get(r.voice).samplesProcessed-r.counter;copyLeadHistogram[lead]=(copyLeadHistogram[lead]??0)+1;
  if(!producerChecks.has(r.voice)){
   const p=predictions.get(r.voice);compare('repeatFlag',p.repeatFlag,r.producerActual.repeatFlag,true);
   for(const key of ['age','oldVelocity','attenuation'])compare(key,p[key],r.producerActual[key]);
   if(p.history.length!==r.producerActual.history.length)throw new Error('Inherited history shape differs');
   p.history.forEach((x,i)=>compare('history:'+i,x,r.producerActual.history[i]));producerChecks.add(r.voice);
  }
 }else if(r.stage==='envelope'){
  if(progress.has(r.thread)||inflightVoices.has(r.voice)||!voices.has(r.voice)||address(r.modal)!==address(r.voice)+0x168n)throw new Error('Unbound envelope or overlapping block');
  if(!envelopes.has(r.voice))envelopes.set(r.voice,new ReleaseProgressEnvelope(r.position));
  else compare('envelope:before',envelopes.get(r.voice).position,r.position);
  compare('envelope:sample-counter',(envelopes.get(r.voice).samplesProcessed+r.samples)>>>0,r.counter,true);
  progress.set(r.thread,r);inflightVoices.add(r.voice);
 }else if(r.stage==='envelopeResult'){
  const step=progress.get(r.thread);
  if(!step||r.ordinal!==step.ordinal||r.voice!==step.voice||r.modal!==step.modal)throw new Error('Unmatched envelope output');
  const model=envelopes.get(r.voice);compare('envelope:after',model.process(step),r.position);
  progress.delete(r.thread);inflightVoices.delete(r.voice);blocks++;
 }else throw new Error('Unknown envelope-chain record');
}
if(progress.size||inflightVoices.size||producerChecks.size!==5||starts!==5||voices.size!==5||envelopes.size!==5||blocks!==data.envelopeBlocks||oldReleasesComputed!==4||copies!==data.copyCount)throw new Error('Incomplete continuous envelope/strike window');
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,floatCount:count-integerCount,integerCount,starts,envelopeBlocks:blocks,copyCount:copies,oldReleasesComputed,
 envelopeVoices:envelopes.size,activeBlocks:[...envelopes.values()].reduce((n,m)=>n+m.activeBlocks,0),clampedBlocks:[...envelopes.values()].reduce((n,m)=>n+m.clampedBlocks,0),
 sampleCountersCarried:true,copyLeadHistogram,oldReleaseReads,envelopeStatesCarried:true,oldReleaseInputComputed:true,envelopeAndOldReleaseTargetsComparisonOnly:true,
 initialEnvelopeValuesObserved:true,durationAndTimestepObserved:true,oldVoiceSelectionCountVelocityAndHistoryObserved:true,
 completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
