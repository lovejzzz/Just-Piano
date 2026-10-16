import fs from 'node:fs';
import {initializeReleaseModel} from '../dsp/release-model-controls.mjs';
import {ReleaseProgressEnvelope} from '../dsp/release-progress-envelope.mjs';
import {releaseCoefficients} from '../dsp/physical-controls.mjs';
import {repeatedStrikeControl} from '../dsp/repeated-strike-control.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(data.schema!==1||data.fixedSites!==true||!data.complete||data.activeSites!==0||data.errors.length||data.starts!==5||!data.envelopeBlocks||!data.refreshCount||data.initializations!==5||data.siteCount!==6)throw new Error('Complete six-site initialized envelope/strike capture required');
const bitsView=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite envelope/control');bitsView.setFloat32(0,x);return bitsView.getUint32(0);};
const sourceModels=new Map(),voices=new Map(),envelopes=new Map(),coefficientStates=new Map(),failures=[];let count=0,mismatches=0,starts=0,blocks=0,oldReleasesComputed=0,copies=0,integerCount=0,refreshes=0,activeRefreshes=0,inactiveRefreshes=0;
const oldReleaseReads=[],copyLeadHistogram={},mismatchesByName={};
const progress=new Map(),inflightVoices=new Set(),copied=new Map(),predictions=new Map(),producerChecks=new Set();
function compare(name,p,a,integer=false){count++;if(integer)integerCount++;if(integer?p!==a:bits(p)!==bits(a)){mismatches++;mismatchesByName[name]=(mismatchesByName[name]??0)+1;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
const address=s=>{if(!/^0x[0-9a-f]+$/.test(s))throw new Error('Invalid object address');return BigInt(s);};
for(const r of data.records){
 if(r.stage==='before'){
  if(r.ordinal!==starts||voices.has(r.newVoice)||r.note!==69)throw new Error('Invalid strike chronology');
  voices.set(r.newVoice,{ordinal:starts,thread:r.thread});envelopes.set(r.newVoice,new ReleaseProgressEnvelope(0));coefficientStates.set(r.newVoice,{duration:0,rate:0,gain:0,generation:0});
  const inputs=structuredClone(r.inputs);
  if(inputs.old){
   if(!copied.has(r.oldVoice))throw new Error('Old release requires prior explicit copy commit');
   const source=copied.get(r.oldVoice);compare('old-release:copy',source.value,inputs.old.release);inputs.old.release=source.value;oldReleasesComputed++;oldReleaseReads.push({ordinal:starts,oldCount:inputs.old.count,...source});
  }else if(r.oldVoice!=='0x0')throw new Error('Unbound absent old voice');
  predictions.set(r.newVoice,repeatedStrikeControl(inputs));starts++;
 }else if(r.stage==='initialize'){
  if(!voices.has(r.voice)||sourceModels.has(r.voice)||envelopes.get(r.voice).blocks||address(r.modal)!==address(r.voice)+0x168n||r.width<1||r.width>4096||r.inputs.decayRows!==0&&(r.selectedRow>=r.inputs.decayRows||r.inputs.selectedDecayRow.length!==r.width))throw new Error('Unbound or late model initialization');
  const model=initializeReleaseModel(r.inputs);
  if(r.actual.polynomial.length!==5)throw new Error('Invalid initialization polynomial');
  model.polynomial.forEach((v,i)=>compare('initialize:polynomial:'+i,v,r.actual.polynomial[i]));
  for(const k of ['rateScale','gainScale','cubicScale','cubicGainScale','timestep'])compare('initialize:'+k,model[k],r.actual[k]);
  sourceModels.set(r.voice,model);
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
 }else if(r.stage==='coefficients'){
  if(!voices.has(r.voice)||address(r.modal)!==address(r.voice)+0x168n||r.generation!==coefficientStates.get(r.voice).generation+1)throw new Error('Invalid coefficient generation binding');
  if(!sourceModels.has(r.voice))throw new Error('Coefficient refresh precedes initialization');
  const model=sourceModels.get(r.voice);
  if(r.inputs.polynomial.length!==5)throw new Error('Invalid coefficient polynomial');
  model.polynomial.forEach((v,i)=>compare('model:polynomial:'+i,v,r.inputs.polynomial[i]));
  for(const k of ['rateScale','gainScale','cubicScale','cubicGainScale'])compare('model:'+k,model[k],r.inputs[k]);
  const c=r.inputs;if(!Number.isInteger(c.releaseFlag)||c.releaseFlag<0||c.releaseFlag>255)throw new Error('Invalid source release flag');
  const active=(c.releaseFlag&1)!==0||Math.fround(c.x)>0;
  const value=active?releaseCoefficients({...model,x:c.x,u:c.u}):{duration:0,rate:0,gain:0};
  for(const key of ['duration','rate','gain'])compare('coefficient:'+key,value[key],r.actual[key]);
  coefficientStates.set(r.voice,{...value,generation:r.generation});refreshes++;if(active)activeRefreshes++;else inactiveRefreshes++;
 }else if(r.stage==='envelope'){
  if(progress.has(r.thread)||inflightVoices.has(r.voice)||!voices.has(r.voice)||address(r.modal)!==address(r.voice)+0x168n)throw new Error('Unbound envelope or overlapping block');
  if(!sourceModels.has(r.voice))throw new Error('Envelope precedes model initialization');
  const source=sourceModels.get(r.voice),coefficients=coefficientStates.get(r.voice),model=envelopes.get(r.voice);
  compare('envelope:baseDuration',source.polynomial[0],r.baseDuration);
  compare('envelope:timestep',source.timestep,r.timestep);
  if(r.generation!==coefficients.generation)throw new Error('Envelope uses unmatched coefficient generation');
  compare('envelope:before',model.position,r.position);
  compare('envelope:duration',coefficients.duration,r.duration);
  compare('envelope:sample-counter',(model.samplesProcessed+r.samples)>>>0,r.counter,true);
  progress.set(r.thread,{...r,computedDuration:coefficients.duration,computedBaseDuration:source.polynomial[0],computedTimestep:source.timestep});inflightVoices.add(r.voice);
 }else if(r.stage==='envelopeResult'){
  const step=progress.get(r.thread);
  if(!step||r.ordinal!==step.ordinal||r.voice!==step.voice||r.modal!==step.modal)throw new Error('Unmatched envelope output');
  compare('envelope:stable-counter',step.counter,r.counter,true);
  compare('envelope:after',envelopes.get(r.voice).process({...step,duration:step.computedDuration,baseDuration:step.computedBaseDuration,timestep:step.computedTimestep}),r.position);
  progress.delete(r.thread);inflightVoices.delete(r.voice);blocks++;
 }else throw new Error('Unknown envelope-chain record');
}
if(sourceModels.size!==5||progress.size||inflightVoices.size||refreshes!==data.refreshCount||!activeRefreshes||producerChecks.size!==5||starts!==5||voices.size!==5||envelopes.size!==5||blocks!==data.envelopeBlocks||oldReleasesComputed!==4||copies!==data.copyCount)throw new Error('Incomplete continuous envelope/strike window');
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,floatCount:count-integerCount,integerCount,starts,envelopeBlocks:blocks,copyCount:copies,refreshes,activeRefreshes,inactiveRefreshes,oldReleasesComputed,
 modelInitializations:sourceModels.size,envelopeVoices:envelopes.size,activeBlocks:[...envelopes.values()].reduce((n,m)=>n+m.activeBlocks,0),clampedBlocks:[...envelopes.values()].reduce((n,m)=>n+m.clampedBlocks,0),
 sampleCountersCarried:true,copyLeadHistogram,oldReleaseReads,envelopeStatesCarried:true,oldReleaseInputComputed:true,envelopeAndOldReleaseTargetsComparisonOnly:true,
 heldColdEnvelopeAndCoefficientsInitializedZero:true,durationTargetsComparisonOnly:true,durationComputedAndCarried:true,sourceModelInitializedAndCarried:true,sourceConfigurationAndDecayRowsObserved:true,modelTargetsComparisonOnly:true,coefficientXUAndFlagsObserved:true,baseDurationAndTimestepComputed:true,oldVoiceSelectionCountVelocityAndHistoryObserved:true,
 completeVoiceOrBrowserEquivalence:false,mismatchesByName,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
