import fs from 'node:fs';
import {nativeScalarExp2f} from '../dsp/native-scalar-exp.mjs';
import {nativeScalarLog10f} from '../dsp/native-scalar-log10.mjs';
import {buildReleaseControlledSupport} from '../dsp/release-controlled-support.mjs';
import {buildReleaseControlledSpectrum} from '../dsp/release-controlled-spectrum.mjs';
import {repeatedStrikeControl} from '../dsp/repeated-strike-control.mjs';
import {DynamicReleaseVoice} from '../dsp/dynamic-release-voice.mjs';
const [capture,output,option,...extra]=process.argv.slice(2);
if(!capture||!output||option&&!['--platform-math-candidate','--native-history-math'].includes(option)||extra.length)throw new Error('Usage: capture.json report.json [--native-history-math | --platform-math-candidate]');
const useCandidates=option==='--platform-math-candidate';
const d=JSON.parse(fs.readFileSync(capture,'utf8'));
if(d.schema!==1||d.fixedSites!==true||d.siteCount!==6||!d.complete||d.pending||d.activeSites!==0||d.errors.length||d.starts!==5||d.spectrumCount!==10||d.finalCount!==10||!d.copyCount||d.initializations!==0||!d.envelopeBlocks||d.envelopePending||!d.coefficientCount)throw new Error('Complete dynamic Rattle capture required');
const f=Math.fround,view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite x/control');view.setFloat32(0,x);return view.getUint32(0);};
const owners=new Map(),voices=new Map(),pending=new Map(),epochs=new Set(),failures=[],byStage={},mismatchesByName={};const modes=new Map();let spectrumCalls=0,finalCalls=0;const histories=new Map(),mathCalls=[];const math={exp2f:x=>{const y=useCandidates?f(2**x):nativeScalarExp2f(x);mathCalls.push({function:'exp2f',input:x,output:y});return y;},log10f:x=>{const y=useCandidates?f(Math.log10(x)):nativeScalarLog10f(x);mathCalls.push({function:'log10f',input:x,output:y});return y;}};let historyUpdates=0,randomDraws=0;const sourceModels=new Map(),copied=new Map(),predictions=new Map(),producerChecks=new Set();let copies=0,oldReleasesComputed=0;const runtimes=new Map(),envelopes=new Map(),envelopePending=new Map(),envelopeCompleted=new Map(),coeffState=new Map();let blocks=0,duplicates=0;let checks=0,mismatches=0,starts=0,updates=0,coefficients=0,active=0,xChanges=0;
function check(name,p,a){checks++;if(bits(p)!==bits(a)){mismatches++;mismatchesByName[name]=(mismatchesByName[name]??0)+1;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
function voice(r){const s=voices.get(r.epoch);if(!s||s.voice!==r.voice||owners.get(r.voice)!==r.epoch)throw new Error('Unbound voice epoch');if(r.modal&&BigInt(r.modal)!==BigInt(r.voice)+0x168n)throw new Error('Invalid modal owner');return s;}
for(const r of d.records){
 byStage[r.stage]=(byStage[r.stage]??0)+1;
 if(r.stage==='before'){
  if(r.ordinal!==starts||r.note!==69||r.epoch!==starts||!Number.isFinite(r.sourceX)||r.sourceX<0||r.sourceX>1)throw new Error('Invalid source chronology');
  const inputs=structuredClone(r.inputs);
  if(inputs.old){
   const c=copied.get(r.oldVoice);if(!c)throw new Error('Old voice release requires prior copy');
   check('old-release',c.value,inputs.old.release);inputs.old.release=c.value;
   const h=histories.get(r.oldVoice);if(!h||h.length!==inputs.old.history.length)throw new Error('Old support history requires computed predecessor');h.forEach((v,i)=>check('old-history',v,inputs.old.history[i]));inputs.old.history=[...h];oldReleasesComputed++;
  }else if(r.oldVoice!=='0x0')throw new Error('Invalid absent old voice');
  predictions.set(starts,repeatedStrikeControl(inputs));
  const x=f(r.sourceX);voices.set(starts,{voice:r.voice,owner:r.owner,initial:x,current:x});owners.set(r.voice,starts);const runtime=new DynamicReleaseVoice(x);runtimes.set(starts,runtime);envelopes.set(starts,runtime.envelope);coeffState.set(starts,{duration:0,rate:0,gain:0});starts++;
 }else if(r.stage==='weights'){
  voice(r);const input=r.input,p=predictions.get(r.epoch),seen=modes.get(r.epoch)??new Set();
  if(!p||input.note!==69||![0,1].includes(input.mode)||seen.has(input.mode))throw new Error('Invalid hardness consumer');
  seen.add(input.mode);modes.set(r.epoch,seen);
  if(p.repeatFlag!==input.controls.repeatFlag)throw new Error('Hardness repeat flag mismatch');
  for(const k of ['age','attenuation'])check('hardness-input:'+k,p[k],input.controls[k]);
  if(r.controls.repeatFlag!==p.repeatFlag)throw new Error('Spectrum repeat flag mismatch');
  const built=buildReleaseControlledSpectrum({...r,repeat:p});const c=built.controls;
  for(const k of ['slope','baseScale'])check('spectrum-control:'+k,c[k],r.actual[k]);
  if(!Number.isInteger(r.count)||r.count<1||r.count>4096||r.actual.extraTable.length!==r.count||r.expWeights.length!==r.count)throw new Error('Incomplete spectrum targets');
  const extra=built.extraTable,log=built.logSpectrum;
  for(let i=0;i<r.count;i++){check('extra-table',extra[i],r.actual.extraTable[i]);check('exp-weight:weights',built.expWeights[i],r.expWeights[i]);}
  if(pending.has(r.thread))throw new Error('Overlapping spectral weights');
  if(r.append.controls.repeatFlag!==p.repeatFlag)throw new Error('Append repeat flag differs');
  check('append-input:attenuation',p.attenuation,r.append.controls.attenuation);
  let history=r.history;
  if(input.mode===0){if(p.history.length!==history.length)throw new Error('Inherited support history shape differs');p.history.forEach((v,i)=>check('support-history-input',v,history[i]));history=[...p.history];}
  const supported=buildReleaseControlledSupport({...r,repeat:p,spectrum:built,history,secondFamilyEnabled:r.append.secondIndices.length>0},math);
  for(const k of ['indices','logAmplitudes','secondIndices','secondLogAmplitudes']){
   if(supported[k].length!==r.append[k].length)throw new Error('Support vector shape differs');
   supported[k].forEach((v,i)=>{if(k.includes('Indices')||k==='indices'){if(v!==r.append[k][i])throw new Error('Support index differs');}else check('support:'+k,v,r.append[k][i]);});
  }
  historyUpdates+=supported.historyUpdates;randomDraws+=supported.randomDraws;
  pending.set(r.thread,{epoch:r.epoch,voice:r.voice,mode:input.mode,count:r.count,header:supported.header,built,supported});spectrumCalls++;
 }else if(r.stage==='copy'){
  voice(r);if([...envelopePending.values()].some(p=>p.epoch===r.epoch))throw new Error('Copy during unfinished envelope');
  const value=runtimes.get(r.epoch).copyRelease();check('copy:modal',value,r.modalPosition);check('copy:voice',value,r.release);copied.set(r.voice,{value,epoch:r.epoch,counter:r.counter});copies++;
  if(!producerChecks.has(r.epoch)){
   const p=predictions.get(r.epoch);if(p.repeatFlag!==r.producerActual.repeatFlag)throw new Error('Repeat flag mismatch');
   for(const k of ['age','oldVelocity','attenuation'])check('repeat:'+k,p[k],r.producerActual[k]);
   if(p.history.length!==r.producerActual.history.length)throw new Error('Inherited history shape mismatch');
   p.history.forEach((v,i)=>check('repeat:history',v,r.producerActual.history[i]));producerChecks.add(r.epoch);
  }
 }else if(r.stage==='final'){
  voice(r);const p=pending.get(r.thread);
  if(!p||p.epoch!==r.epoch||p.voice!==r.voice||p.mode!==r.mode||p.count!==r.count||JSON.stringify(p.header)!==JSON.stringify(r.table.header))throw new Error('Unbound weighted source');
  if(p.supported.history.length!==r.history.length)throw new Error('Final history shape differs');p.supported.history.forEach((v,i)=>check('support-history-final',v,r.history[i]));
  if(p.supported.randomState===null?r.randomState!==null:!r.randomState||p.supported.randomState.some((v,i)=>v!==r.randomState[i]))throw new Error('Final random state differs');
  for(const k of ['frequency','decay','amplitude','phase']){
   if(p.supported.source[k].length!==r.table.source[k].length)throw new Error('Weighted source shape differs');
   p.supported.source[k].forEach((v,i)=>check('final-source:'+k,v,r.table.source[k][i]));
  }
  if(r.mode===0)histories.set(r.voice,[...p.supported.history]);
  pending.delete(r.thread);finalCalls++;
 }else if(r.stage==='coefficients'){
  const s=voice(r);if(r.owner!==s.owner||!Number.isFinite(r.sourceX)||r.sourceX<0||r.sourceX>1)throw new Error('Invalid global Rattle source');
  const x=f(r.sourceX);if(bits(x)!==bits(s.current))xChanges++;s.current=x;runtimes.get(r.epoch).updateRattle(x);check('coefficient:voice-x',x,r.currentX);
  check('coefficient:modal-x',s.current,r.modalX);
  if(!Number.isInteger(r.releaseFlag)||r.releaseFlag<0||r.releaseFlag>255)throw new Error('Invalid release flag');
  const enabled=(r.releaseFlag&1)!==0||s.current>0;
  const v=runtimes.get(r.epoch).refresh({model:r.inputs,u:r.u,releaseFlag:r.releaseFlag});
  if(enabled)active++;
  for(const k of ['duration','rate','gain'])check(k,v[k],r.actual[k]);coeffState.set(r.epoch,v);epochs.add(r.epoch);coefficients++;
 }else if(r.stage==='envelopeResult'){
  voice(r);const runtime=runtimes.get(r.epoch),env=runtime.envelope,c=coeffState.get(r.epoch);
  check('envelope:duration',c.duration,r.duration);
  if(((env.samplesProcessed+r.samples)>>>0)!==r.counter)throw new Error('Envelope counter discontinuity');
  const value=runtime.process({samples:r.samples,baseDuration:r.baseDuration,timestep:r.timestep});
  check('envelope:after',value,r.position);envelopeCompleted.set(r.thread,r);blocks++;
 }else if(r.stage==='duplicateEnvelopeResult'){
  voice(r);const p=envelopeCompleted.get(r.thread);
  if(envelopePending.has(r.thread)||!p||p.epoch!==r.epoch||p.voice!==r.voice||p.modal!==r.modal||p.counter!==r.counter||bits(p.position)!==bits(r.position))throw new Error('Unproven duplicate return');
  duplicates++;
 }else throw new Error('Unknown update stage');
}
if(histories.size!==5||historyUpdates!==4||!randomDraws||sourceModels.size!==0||finalCalls!==10||oldReleasesComputed!==4||producerChecks.size!==5||copies!==d.copyCount||starts!==5||voices.size!==5||epochs.size!==5||spectrumCalls!==10||modes.size!==5||[...modes.values()].some(m=>m.size!==2)||duplicates!==(d.duplicateEnvelopeReturns??0)||blocks!==d.envelopeBlocks||envelopePending.size||coefficients!==d.coefficientCount||!active||!xChanges||pending.size)throw new Error('Incomplete dynamic update chain');
const report={passed:!mismatches,checks,mismatches,modelInitializations:sourceModels.size,starts,spectrumCalls,finalCalls,spectrumRows:d.records.filter(r=>r.stage==='weights').reduce((n,r)=>n+r.count,0),copyCount:copies,oldReleasesComputed,envelopeBlocks:blocks,duplicateEnvelopeReturns:duplicates,coefficients,active,xChanges,byStage,sourceControlObserved:true,globalXAtCoefficientObserved:true,dynamicUpdateSiteNotObservedThisWindow:true,setterSiteNotObservedThisWindow:true,envelopeStatesCarried:true,envelopeDurationComputed:true,baseDurationAndTimestepObserved:true,modelInitializationSiteNotObservedThisWindow:true,coefficientModelFieldsObserved:true,coefficientTargetsComparisonOnly:true,activeCubeSiteNotObservedThisWindow:true,releaseFlagAndUObserved:true,oldReleaseInputComputed:true,browserCompatibleRuntimeModuleUsed:true,browserCompatibleSpectrumModuleUsed:true,hardnessRepeatInputsComputed:true,spectrumHardnessComputed:true,logSpectrumComputed:true,logSpectrumSiteNotObservedThisWindow:true,hardnessScalarSiteNotObservedThisWindow:true,spectrumModelTablesAndOtherControlsObserved:true,expWeightsComputedAndCompared:true,weightedSourceComputedAsIntermediate:true,finalExcitationSourceCompared:true,weightedSiteNotObservedThisWindow:true,preWeightSourceStillObserved:true,nativeCosfFiniteRangeLimit:2**26,historyUpdates,randomDraws,supportHistoryVoices:histories.size,historyBetweenStrikesComputed:true,initialRandomStatePerInvocationObserved:true,secondFamilyGateObserved:true,nativeExp2fLog10fImplemented:!useCandidates,platformMathCandidatesExplicit:useCandidates,mathCalls,browserCosfCandidateUsed:false,hardnessSourceAndCurvesObserved:true,oldVoiceSelectionCountVelocityAndHistoryObserved:true,continuousEnvelopeAndVoiceOrBrowserEquivalence:false,mismatchesByName,failures};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,mathCalls:undefined}));if(!report.passed)process.exitCode=1;
