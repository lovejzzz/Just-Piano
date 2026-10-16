import {modalPositionWeights} from '../dsp/modal-position-weights.mjs';
import {refreshDampedModes} from '../dsp/damped-modal-refresh.mjs';
import {initialModalGroup} from '../dsp/modal-initial.mjs';
import {advanceVoiceInitializationRandom} from '../dsp/voice-initial-random.mjs';
import {selectVoiceModes} from '../dsp/voice-mode-selection.mjs';
import {mapVoiceSource} from '../dsp/voice-source-mapping.mjs';
import fs from 'node:fs';
import {mergeReleaseExcitation} from '../dsp/release-merged-excitation.mjs';
import {nativeScalarExp2f} from '../dsp/native-scalar-exp.mjs';
import {nativeScalarLog10f} from '../dsp/native-scalar-log10.mjs';
import {buildReleaseControlledSupport} from '../dsp/release-controlled-support.mjs';
import {buildReleaseControlledSpectrum} from '../dsp/release-controlled-spectrum.mjs';
import {repeatedStrikeControl} from '../dsp/repeated-strike-control.mjs';
import {DynamicReleaseVoice} from '../dsp/dynamic-release-voice.mjs';
const [capture,output,option,...extra]=process.argv.slice(2);
let randomWordChecks=0;const initializationRandom=[];const weightDiagnostics=[];const initialStates=new Map();let initialGroups=0;
if(!capture||!output||option!=='--pow-candidate'||extra.length)throw new Error('Usage: capture.json report.json --pow-candidate');
const d=JSON.parse(fs.readFileSync(capture,'utf8'));
if(d.schema!==1||d.fixedSites!==true||d.siteCount!==6||!d.complete||d.pending||d.activeSites!==0||d.errors.length||d.starts!==5||d.spectrumCount!==10||d.finalCount!==5||!d.copyCount||d.initializations!==0||!d.envelopeBlocks||d.envelopePending||!d.coefficientCount)throw new Error('Complete dynamic Rattle capture required');
const f=Math.fround,view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite x/control');view.setFloat32(0,x);return view.getUint32(0);};
const owners=new Map(),voices=new Map(),pending=new Map(),epochs=new Set(),failures=[],byStage={},mismatchesByName={};const modes=new Map();let spectrumCalls=0,finalCalls=0;const histories=new Map(),mathCalls=[];const math={exp2f:x=>{const y=nativeScalarExp2f(x);mathCalls.push({function:'exp2f',input:x,output:y});return y;},log10f:x=>{const y=nativeScalarLog10f(x);mathCalls.push({function:'log10f',input:x,output:y});return y;}};const powCalls=[];const postMath={pow:(x,y)=>{const output=Math.pow(x,y);powCalls.push({input:x,exponent:y,output});return output;}};let historyUpdates=0,randomDraws=0,phaseRandomDraws=0,modeSeedBridges=0;const sourceModels=new Map(),copied=new Map(),predictions=new Map(),producerChecks=new Set();let copies=0,oldReleasesComputed=0;const runtimes=new Map(),envelopes=new Map(),envelopePending=new Map(),envelopeCompleted=new Map(),coeffState=new Map();let blocks=0,duplicates=0;let checks=0,mismatches=0,starts=0,updates=0,coefficients=0,active=0,xChanges=0;
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
  const x=f(r.sourceX);voices.set(starts,{voice:r.voice,owner:r.owner,initial:x,current:x,newVelocity:f(inputs.newVelocity)});owners.set(r.voice,starts);const runtime=new DynamicReleaseVoice(x);runtimes.set(starts,runtime);envelopes.set(starts,runtime.envelope);coeffState.set(starts,{duration:0,rate:0,gain:0});starts++;
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
  let invocation=pending.get(r.epoch);
  if(!invocation){invocation={voice:r.voice,thread:r.thread,modes:new Map()};pending.set(r.epoch,invocation);}
  if(invocation.voice!==r.voice||invocation.thread!==r.thread||invocation.modes.has(input.mode))throw new Error('Invalid mode pairing');
  let seed=r.randomState;
  if(input.mode===1){
   const first=invocation.modes.get(0);if(!first||!seed||first.supported.randomState.some((v,i)=>v!==seed[i]))throw new Error('Uncomputed primary-to-secondary random bridge');
   seed=[...first.supported.randomState];modeSeedBridges++;
  }
  const supported=buildReleaseControlledSupport({...r,randomState:seed,repeat:p,spectrum:built,history,secondFamilyEnabled:r.append.secondIndices.length>0},math);
  for(const k of ['indices','logAmplitudes','secondIndices','secondLogAmplitudes']){
   if(supported[k].length!==r.append[k].length)throw new Error('Support vector shape differs');
   supported[k].forEach((v,i)=>{if(k.includes('Indices')||k==='indices'){if(v!==r.append[k][i])throw new Error('Support index differs');}else check('support:'+k,v,r.append[k][i]);});
  }
  historyUpdates+=supported.historyUpdates;randomDraws+=supported.randomDraws;
  invocation.modes.set(input.mode,{supported,postInputs:r.postInputs,mergeControls:r.mergeControls,lateRandomInputs:r.lateRandomInputs,selectionSource:r.selectionSource});spectrumCalls++;
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
  if(initialStates.has(r.epoch))throw new Error('Duplicate final initialization');
   const v=voice(r),p=pending.get(r.epoch);
  if(!p||p.voice!==r.voice||p.modes.size!==2)throw new Error('Unpaired merged excitation');
  const first=p.modes.get(0),second=p.modes.get(1);
  for(const k of Object.keys(first.mergeControls)){check('merge-control:secondary:'+k,first.mergeControls[k],second.mergeControls[k]);}
  check('post-input:velocity',v.newVelocity,first.postInputs.velocity);
  const built=mergeReleaseExcitation({primary:first.supported,secondary:second.supported,
   postInputs:{...first.postInputs,velocity:v.newVelocity},controls:first.mergeControls,randomState:second.supported.randomState},postMath);
  check('post:feedbackGain',built.post.feedbackGain,r.feedbackGain);check('post:feedbackDecay',built.post.feedbackDecay,r.feedbackDecay);
  if(first.supported.history.length!==r.history.length)throw new Error('Final history shape differs');first.supported.history.forEach((value,i)=>check('support-history-final',value,r.history[i]));
  let mappedRandomState=built.randomState;
  if(!first.lateRandomInputs)throw new Error('Initialization random sources required');
  if(first.lateRandomInputs){
   if(JSON.stringify(first.lateRandomInputs)!==JSON.stringify(second.lateRandomInputs))throw new Error('Initialization random source snapshots differ');
   const late=advanceVoiceInitializationRandom({inputs:first.lateRandomInputs,randomState:built.randomState});
   mappedRandomState=late.randomState;initializationRandom.push({epoch:r.epoch,...late});
  }
  if(!r.randomState||r.randomState.length!==mappedRandomState.length)throw new Error('Missing initial random state');
  // Keep a late RNG mismatch fatal to the overall report, while retaining all
  // array comparisons. Never replace our phase seed with this native target.
  mappedRandomState.forEach((value,i)=>{checks++;randomWordChecks++;if(value!==r.randomState[i]){mismatches++;mismatchesByName['initial-random-state']=(mismatchesByName['initial-random-state']??0)+1;if(failures.length<30)failures.push({name:'initial-random-state',epoch:r.epoch,index:i,predicted:value,actual:r.randomState[i]});}});
  const [columns,rows,specialA,specialB,referenceRow,lower,upper]=built.header;
  if(specialA||specialB||rows*columns!==built.source.frequency.length)throw new Error('Unsupported mapped source');
  if(!first.selectionSource||JSON.stringify(first.selectionSource)!==JSON.stringify(second.selectionSource))throw new Error('Missing or differing early selection sources');
  for(const key of Object.keys(first.selectionSource))check('selection-source:'+key,first.selectionSource[key],r.selectionControls[key]);
  const selection=selectVoiceModes({...r.selectionControls,...first.selectionSource,source:built.source,columns,splitRow:lower});
  if(JSON.stringify(selection.layout)!==JSON.stringify(r.target.groups))throw new Error('Computed selection layout differs');
  const target=r.target,c=target.controls,owned=coeffState.get(r.epoch);
  if(!owned||target.input_mode!==0||target.layout_flag!==0||target.energy_layout!==2||target.initial_flag!==1||target.sample_counter!==0)throw new Error('Initial no-input normal layout required');
  const mapped=mapVoiceSource({source:built.source,columns,referenceRow,zeroAdjustmentRows:[lower,upper],layout:selection.layout,indices:selection.indices});
  const expected=selection.layout.flatMap(([start,,,count])=>Array.from({length:Math.ceil((start+count)/4)-start/4},(_,i)=>start+4*i));
  const controls={timestep:c['0xc'],pitch:c['0x780'],adjustmentRatio:c['0x784'],inputMode:0};
  const states=new Map();
  for(const lane of expected){
   const initial=initialModalGroup({...controls,frequency:mapped.frequency.slice(lane,lane+4),pitchAdjustment:mapped.J.slice(lane,lane+4),amplitude:mapped.amplitude.slice(lane,lane+4),phase:mapped.phase.slice(lane,lane+4)});
   for(let i=0;i<4;i++)states.set(lane+i,Object.fromEntries(['P','Q','energy','S','K','sinInverse'].map(name=>[name,initial[name][i]])));
   initialGroups++;
  }
  if(target.lanes.length!==states.size)throw new Error('Incomplete final initialized lanes');
  const targets=new Map(target.lanes.map(row=>[row.lane,row]));if(targets.size!==states.size)throw new Error('Duplicate final target lane');
  check('initial:release-rate',owned.rate,c['0x7e4']);check('initial:position-gain',owned.gain,c['0x7b0']);
  const referenceFrequency=built.source.frequency[referenceRow*columns];
  check('position-source:referenceFrequency',referenceFrequency,r.positionInputs.referenceFrequency);
  if(lower!==r.positionInputs.cutoffIndex)throw new Error('Position cutoff must come from computed source header');
  const positionWeights=owned.gain===0&&c['0x7e0']===0?new Float32Array(mapped.frequency.length):modalPositionWeights({...r.positionInputs,referenceFrequency,cutoffIndex:lower,frequency:mapped.frequency,indexStorage:selection.indexStorage,layout:selection.layout});
  const groups=selection.layout.map(([start,,,count],group)=>Array.from({length:Math.ceil(count/4)*4},(_,i)=>{
   const lane=start+i,row=targets.get(lane),state=states.get(lane);
   if(!row||!state||row.group!==group||row.valid!==(i<count))throw new Error('Final target lane/group identity differs');
   return {modalDecay:mapped.decay[lane],energy:state.energy,cosine:state.K,weight:positionWeights[lane]};
  }));
  const refreshed=refreshDampedModes(groups,{timestep:controls.timestep,pitch:controls.pitch,scale:c['0x7f8'],release:owned.rate,gain:owned.gain,extraGain:c['0x7e0'],releaseShape:c['0x7ec'],blockLength:target.block_length_V768,blockFactor:target.block_factor_V810});
  check('initial:normalization',refreshed.normalization,c['0x7e8']);
  for(const [group,[start,,,count]] of selection.layout.entries())for(let i=0;i<groups[group].length;i++){
   const lane=start+i,row=targets.get(lane),state=states.get(lane),coeff=refreshed.groups[group][i];
   if(bits(positionWeights[lane])!==bits(row.position_weight))weightDiagnostics.push({epoch:r.epoch,lane,valid:row.valid,index:selection.indices[lane],frequency:mapped.frequency[lane],predicted:positionWeights[lane],actual:row.position_weight});
   check('initial:position-weight',positionWeights[lane],row.position_weight);
   state.Q=f(state.Q*coeff.radius);Object.assign(state,coeff);
   check('mapped:frequency',mapped.frequency[lane],row.frequency);check('mapped:J',mapped.J[lane],row.J);check('mapped:decay',mapped.decay[lane],row.modal_decay);
   for(const name of ['P','Q','energy','S','K'])check('final:'+name,state[name],row[name]);
   check('final:sinInverse',state.sinInverse,row.sin_inverse);check('final:radius',state.radius,row.R);check('final:effectiveDecay',state.decay,row.effective_decay);check('final:A',state.A,row.A);check('final:B',state.B,row.B);
  }
  initialStates.set(r.epoch,{layout:selection.layout,controls,states});
  histories.set(r.voice,[...first.supported.history]);phaseRandomDraws+=built.phaseRandomDraws;
  pending.delete(r.epoch);finalCalls++;
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
if(initialStates.size!==5||!initialGroups||modeSeedBridges!==5||powCalls.length!==5||histories.size!==5||historyUpdates!==4||!randomDraws||sourceModels.size!==0||finalCalls!==5||oldReleasesComputed!==4||producerChecks.size!==5||copies!==d.copyCount||starts!==5||voices.size!==5||epochs.size!==5||spectrumCalls!==10||modes.size!==5||[...modes.values()].some(m=>m.size!==2)||duplicates!==(d.duplicateEnvelopeReturns??0)||blocks!==d.envelopeBlocks||envelopePending.size||coefficients!==d.coefficientCount||!active||!xChanges||pending.size)throw new Error('Incomplete dynamic update chain');
const initialPredictions=[...initialStates].map(([epoch,s])=>({epoch,layout:s.layout,controls:s.controls,lanes:[...s.states].map(([lane,state])=>({lane,...state}))}));
const report={passed:!mismatches,weightDiagnostics,initialPredictions,checks,comparedFloatValues:checks-randomWordChecks,comparedRandomWords:randomWordChecks,initializationRandom,initializationRandomControlsObserved:initializationRandom.length===starts,initializationRandomOutputsNotDirectlyCompared:true,randomStateAtInitialVerified:!mismatchesByName['initial-random-state'],mismatches,modelInitializations:sourceModels.size,starts,spectrumCalls,finalCalls,spectrumRows:d.records.filter(r=>r.stage==='weights').reduce((n,r)=>n+r.count,0),copyCount:copies,oldReleasesComputed,envelopeBlocks:blocks,duplicateEnvelopeReturns:duplicates,coefficients,active,xChanges,byStage,sourceControlObserved:true,globalXAtCoefficientObserved:true,dynamicUpdateSiteNotObservedThisWindow:true,setterSiteNotObservedThisWindow:true,envelopeStatesCarried:true,envelopeDurationComputed:true,baseDurationAndTimestepObserved:true,modelInitializationSiteNotObservedThisWindow:true,coefficientModelFieldsObserved:true,coefficientTargetsComparisonOnly:true,activeCubeSiteNotObservedThisWindow:true,releaseFlagAndUObserved:true,oldReleaseInputComputed:true,browserCompatibleRuntimeModuleUsed:true,browserCompatibleSpectrumModuleUsed:true,hardnessRepeatInputsComputed:true,spectrumHardnessComputed:true,logSpectrumComputed:true,logSpectrumSiteNotObservedThisWindow:true,hardnessScalarSiteNotObservedThisWindow:true,spectrumModelTablesAndOtherControlsObserved:true,expWeightsComputedAndCompared:true,weightedSourceComputedAsIntermediate:true,mergedExcitationSourceCompared:false,mergedSourceIntermediateComputed:true,modeSelectionComputed:true,nativeScalarLog2Implemented:true,selectionControlsObserved:true,mappedArraysComputed:true,nativeIndexAndLayoutComparisonOnly:true,rawInitialPQComputed:true,initialRadiiComputed:true,initialDampedQComputed:true,initialPositionWeightsObserved:false,initialPositionWeightsComputed:true,positionAndRolloffControlsObserved:true,positionReferenceAndCutoffComputed:true,nativeVectorCosImplemented:true,nativeIndexNotObservedThisWindow:true,energyNormalizationComputedFromOwnEnergy:true,initialReleaseRateAndGainComputed:true,initialPitchRatioAndTimestepObserved:true,initialGroups,perModeFinalSiteNotObservedThisWindow:true,postAndMergeComputed:true,phaseVariationComputed:true,weightedSiteNotObservedThisWindow:true,preWeightSourceStillObserved:true,nativeCosfFiniteRangeLimit:2**26,historyUpdates,randomDraws,supportHistoryVoices:histories.size,historyBetweenStrikesComputed:true,initialRandomStatePerVoiceObserved:true,primaryToSecondarySeedComputed:true,modeSeedBridges,phaseRandomDraws,secondFamilyGateObserved:true,nativeExp2fLog10fImplemented:true,historyMathCandidatesUsed:false,mathCalls,powCalls,doublePowCandidateUsed:true,powCandidateExplicit:true,browserCosfCandidateUsed:false,hardnessSourceAndCurvesObserved:true,oldVoiceSelectionCountVelocityAndHistoryObserved:true,continuousEnvelopeAndVoiceOrBrowserEquivalence:false,mismatchesByName,failures};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,mathCalls:undefined,powCalls:undefined,initialPredictions:undefined}));if(!report.passed)process.exitCode=1;
