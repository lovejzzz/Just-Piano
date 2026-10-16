import fs from 'node:fs';
import {excitationHardness} from '../dsp/excitation-hardness.mjs';
import {nativeScalarCos} from '../dsp/native-scalar-sin.mjs';
import {repeatedStrikeControl} from '../dsp/repeated-strike-control.mjs';
import {DynamicReleaseVoice} from '../dsp/dynamic-release-voice.mjs';
const [capture,output,...extra]=process.argv.slice(2);
if(!capture||!output||extra.length)throw new Error('Usage: capture.json report.json');
const d=JSON.parse(fs.readFileSync(capture,'utf8'));
if(d.schema!==1||d.fixedSites!==true||d.siteCount!==6||!d.complete||d.pending||d.activeSites!==0||d.errors.length||d.starts!==5||d.hardnessCount!==10||!d.copyCount||d.initializations!==5||!d.envelopeBlocks||d.envelopePending||!d.coefficientCount)throw new Error('Complete dynamic Rattle capture required');
const f=Math.fround,view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite x/control');view.setFloat32(0,x);return view.getUint32(0);};
const owners=new Map(),voices=new Map(),pending=new Map(),epochs=new Set(),failures=[],byStage={},mismatchesByName={};const modes=new Map();let hardnessCalls=0;const sourceModels=new Map(),copied=new Map(),predictions=new Map(),producerChecks=new Set();let copies=0,oldReleasesComputed=0;const runtimes=new Map(),envelopes=new Map(),envelopePending=new Map(),envelopeCompleted=new Map(),coeffState=new Map();let blocks=0,duplicates=0;let checks=0,mismatches=0,starts=0,updates=0,coefficients=0,active=0,xChanges=0;
function check(name,p,a){checks++;if(bits(p)!==bits(a)){mismatches++;mismatchesByName[name]=(mismatchesByName[name]??0)+1;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
function voice(r){const s=voices.get(r.epoch);if(!s||s.voice!==r.voice||owners.get(r.voice)!==r.epoch)throw new Error('Unbound voice epoch');if(r.modal&&BigInt(r.modal)!==BigInt(r.voice)+0x168n)throw new Error('Invalid modal owner');return s;}
for(const r of d.records){
 byStage[r.stage]=(byStage[r.stage]??0)+1;
 if(r.stage==='before'){
  if(r.ordinal!==starts||r.note!==69||r.epoch!==starts||!Number.isFinite(r.sourceX)||r.sourceX<0||r.sourceX>1)throw new Error('Invalid source chronology');
  const inputs=structuredClone(r.inputs);
  if(inputs.old){
   const c=copied.get(r.oldVoice);if(!c)throw new Error('Old voice release requires prior copy');
   check('old-release',c.value,inputs.old.release);inputs.old.release=c.value;oldReleasesComputed++;
  }else if(r.oldVoice!=='0x0')throw new Error('Invalid absent old voice');
  predictions.set(starts,repeatedStrikeControl(inputs));
  const x=f(r.sourceX);voices.set(starts,{voice:r.voice,owner:r.owner,initial:x,current:x});owners.set(r.voice,starts);const runtime=new DynamicReleaseVoice(x);runtimes.set(starts,runtime);envelopes.set(starts,runtime.envelope);coeffState.set(starts,{duration:0,rate:0,gain:0});starts++;
 }else if(r.stage==='hardness'){
  voice(r);const input=r.input,p=predictions.get(r.epoch),seen=modes.get(r.epoch)??new Set();
  if(!p||input.note!==69||![0,1].includes(input.mode)||seen.has(input.mode))throw new Error('Invalid hardness consumer');
  seen.add(input.mode);modes.set(r.epoch,seen);
  if(p.repeatFlag!==input.controls.repeatFlag)throw new Error('Hardness repeat flag mismatch');
  for(const k of ['age','attenuation'])check('hardness-input:'+k,p[k],input.controls[k]);
  const result=excitationHardness({...input,controls:{...input.controls,repeatFlag:p.repeatFlag,age:p.age,attenuation:p.attenuation}},{cosf:nativeScalarCos});
  for(const k of ['primary','secondary','referenceFrequency'])check('hardness:'+k,result[k],r.actual[k]);hardnessCalls++;
 }else if(r.stage==='copy'){
  voice(r);if([...envelopePending.values()].some(p=>p.epoch===r.epoch))throw new Error('Copy during unfinished envelope');
  const value=runtimes.get(r.epoch).copyRelease();check('copy:modal',value,r.modalPosition);check('copy:voice',value,r.release);copied.set(r.voice,{value,epoch:r.epoch,counter:r.counter});copies++;
  if(!producerChecks.has(r.epoch)){
   const p=predictions.get(r.epoch);if(p.repeatFlag!==r.producerActual.repeatFlag)throw new Error('Repeat flag mismatch');
   for(const k of ['age','oldVelocity','attenuation'])check('repeat:'+k,p[k],r.producerActual[k]);
   if(p.history.length!==r.producerActual.history.length)throw new Error('Inherited history shape mismatch');
   p.history.forEach((v,i)=>check('repeat:history',v,r.producerActual.history[i]));producerChecks.add(r.epoch);
  }
 }else if(r.stage==='initialize'){
  voice(r);if(sourceModels.has(r.epoch)||envelopes.get(r.epoch).blocks||r.width<1||r.width>4096||r.inputs.decayRows!==0&&(r.selectedRow>=r.inputs.decayRows||r.inputs.selectedDecayRow.length!==r.width))throw new Error('Unbound model initialization');
  const model=runtimes.get(r.epoch).initializeModel(r.inputs);
  if(r.actual.polynomial.length!==5)throw new Error('Invalid model polynomial');
  model.polynomial.forEach((v,i)=>check('initialize:polynomial:'+i,v,r.actual.polynomial[i]));
  for(const k of ['rateScale','gainScale','cubicScale','cubicGainScale','timestep'])check('initialize:'+k,model[k],r.actual[k]);
  sourceModels.set(r.epoch,model);
 }else if(r.stage==='coefficients'){
  const s=voice(r);if(r.owner!==s.owner||!Number.isFinite(r.sourceX)||r.sourceX<0||r.sourceX>1)throw new Error('Invalid global Rattle source');
  const x=f(r.sourceX);if(bits(x)!==bits(s.current))xChanges++;s.current=x;runtimes.get(r.epoch).updateRattle(x);check('coefficient:voice-x',x,r.currentX);
  if(!sourceModels.has(r.epoch))throw new Error('Coefficients precede initialization');
  const model=sourceModels.get(r.epoch);model.polynomial.forEach((v,i)=>check('model:polynomial:'+i,v,r.inputs.polynomial[i]));
  for(const k of ['rateScale','gainScale','cubicScale','cubicGainScale'])check('model:'+k,model[k],r.inputs[k]);
  check('coefficient:modal-x',s.current,r.modalX);
  if(!Number.isInteger(r.releaseFlag)||r.releaseFlag<0||r.releaseFlag>255)throw new Error('Invalid release flag');
  const enabled=(r.releaseFlag&1)!==0||s.current>0;
  const v=runtimes.get(r.epoch).refresh({u:r.u,releaseFlag:r.releaseFlag});
  if(enabled)active++;
  for(const k of ['duration','rate','gain'])check(k,v[k],r.actual[k]);coeffState.set(r.epoch,v);epochs.add(r.epoch);coefficients++;
 }else if(r.stage==='envelopeResult'){
  voice(r);if(!sourceModels.has(r.epoch))throw new Error('Envelope precedes source initialization');
  const source=sourceModels.get(r.epoch),runtime=runtimes.get(r.epoch),env=runtime.envelope,c=coeffState.get(r.epoch);
  check('envelope:duration',c.duration,r.duration);check('envelope:baseDuration',source.polynomial[0],r.baseDuration);check('envelope:timestep',source.timestep,r.timestep);
  if(((env.samplesProcessed+r.samples)>>>0)!==r.counter)throw new Error('Envelope counter discontinuity');
  const value=runtime.process({samples:r.samples});
  check('envelope:after',value,r.position);envelopeCompleted.set(r.thread,r);blocks++;
 }else if(r.stage==='duplicateEnvelopeResult'){
  voice(r);const p=envelopeCompleted.get(r.thread);
  if(envelopePending.has(r.thread)||!p||p.epoch!==r.epoch||p.voice!==r.voice||p.modal!==r.modal||p.counter!==r.counter||bits(p.position)!==bits(r.position))throw new Error('Unproven duplicate return');
  duplicates++;
 }else throw new Error('Unknown update stage');
}
if(sourceModels.size!==5||oldReleasesComputed!==4||producerChecks.size!==5||copies!==d.copyCount||starts!==5||voices.size!==5||epochs.size!==5||hardnessCalls!==10||modes.size!==5||[...modes.values()].some(m=>m.size!==2)||duplicates!==(d.duplicateEnvelopeReturns??0)||blocks!==d.envelopeBlocks||envelopePending.size||coefficients!==d.coefficientCount||!active||!xChanges||pending.size)throw new Error('Incomplete dynamic update chain');
const report={passed:!mismatches,checks,mismatches,modelInitializations:sourceModels.size,starts,hardnessCalls,copyCount:copies,oldReleasesComputed,envelopeBlocks:blocks,duplicateEnvelopeReturns:duplicates,coefficients,active,xChanges,byStage,sourceControlObserved:true,globalXAtCoefficientObserved:true,dynamicUpdateSiteNotObservedThisWindow:true,setterSiteNotObservedThisWindow:true,envelopeStatesCarried:true,envelopeDurationComputed:true,baseDurationAndTimestepComputed:true,sourceModelInitializedAndCarried:true,sourceConfigurationAndDecayRowsObserved:true,coefficientTargetsComparisonOnly:true,activeCubeSiteNotObservedThisWindow:true,releaseFlagAndUObserved:true,coefficientModelTargetsComparisonOnly:true,oldReleaseInputComputed:true,browserCompatibleRuntimeModuleUsed:true,hardnessRepeatInputsComputed:true,nativeCosfFiniteRangeLimit:2**26,browserCosfCandidateUsed:false,hardnessSourceAndCurvesObserved:true,oldVoiceSelectionCountVelocityAndHistoryObserved:true,continuousEnvelopeAndVoiceOrBrowserEquivalence:false,mismatchesByName,failures};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
