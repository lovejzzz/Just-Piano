import {verifyVoiceTailEnvelopes} from './pianoteq_replay_voice_tail_envelopes.mjs';
import {verifyConsumerCross} from './pianoteq_replay_consumer_cross.mjs';
import {verifyVoiceRattleAudio} from './pianoteq_replay_voice_rattle.mjs';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
import {writePostConsumerStems,writeVoiceRattleStems,writeVoiceTailStems} from './pianoteq_write_post_consumer_stems.mjs';
import {rattleDispatchRoute} from '../dsp/rattle-dispatch-control.mjs';
import {RattleControlState} from '../dsp/rattle-control-state.mjs';
import {validateCommitSlots} from './pianoteq_validate_commit_slots.mjs';
import {verifyConsumerInjection} from './pianoteq_replay_consumer_injection.mjs';
import {renderVoiceDelay} from '../dsp/voice-output-delay.mjs';
import {writeWorkerStems} from './pianoteq_write_worker_stems.mjs';
import {modalOnsetDuration,ModalOnsetEnvelope} from '../dsp/modal-onset-envelope.mjs';
import {renderModalVoiceBlock} from '../dsp/modal-voice-block.mjs';
import {updateModalEnergyAndPrune} from '../dsp/modal-energy-pruning.mjs';
import {modalAngleGroup,projectModalHistory} from '../dsp/modal-initial.mjs';
import {transportModalBlock,bypassPostModalProcessor,redistributeModalGroups} from '../dsp/post-modal-transport.mjs';
import {modalPositionWeights,positionWeightWarmupBlocks} from '../dsp/modal-position-weights.mjs';
import {refreshDampedModes} from '../dsp/damped-modal-refresh.mjs';
import {initialModalGroup} from '../dsp/modal-initial.mjs';
import {advanceVoiceInitializationRandom} from '../dsp/voice-initial-random.mjs';
import {selectVoiceModes} from '../dsp/voice-mode-selection.mjs';
import {mapVoiceSource} from '../dsp/voice-source-mapping.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {mergeReleaseExcitation} from '../dsp/release-merged-excitation.mjs';
import {nativeScalarExp2f} from '../dsp/native-scalar-exp.mjs';
import {nativeScalarLog10f} from '../dsp/native-scalar-log10.mjs';
import {buildReleaseControlledSupport} from '../dsp/release-controlled-support.mjs';
import {buildReleaseControlledSpectrum} from '../dsp/release-controlled-spectrum.mjs';
import {repeatedStrikeControl} from '../dsp/repeated-strike-control.mjs';
import {DynamicReleaseVoice} from '../dsp/dynamic-release-voice.mjs';
const [capture,output,option,...extra]=process.argv.slice(2);
let randomWordChecks=0,doubleChecks=0;const initializationRandom=[];const weightDiagnostics=[];const initialStates=new Map(),initialSnapshots=[];let initialGroups=0;let refreshes=0,renderedBlocks=0,comparedOutputBlocks=0,tailTwelveGroups=0;const modalOutputs=new Map(),continuousOutputs=[],removals=[];let transportTails;
let stemsDirectory,postStemsDirectory,resumeAuditPath,archiveRepeatModelPath,rattleStemsDirectory,tailStemsDirectory;
for(const flag of extra){
 if(flag.startsWith('--worker-stems=')&&stemsDirectory===undefined)stemsDirectory=flag.slice('--worker-stems='.length);
 else if(flag.startsWith('--resume-audit=')&&resumeAuditPath===undefined)resumeAuditPath=flag.slice('--resume-audit='.length);
 else if(flag.startsWith('--post-stems=')&&postStemsDirectory===undefined)postStemsDirectory=flag.slice('--post-stems='.length);
 else if(flag.startsWith('--archive-repeat-model=')&&archiveRepeatModelPath===undefined)archiveRepeatModelPath=flag.slice('--archive-repeat-model='.length);
 else if(flag.startsWith('--rattle-stems=')&&rattleStemsDirectory===undefined)rattleStemsDirectory=flag.slice('--rattle-stems='.length);
 else if(flag.startsWith('--tail-stems=')&&tailStemsDirectory===undefined)tailStemsDirectory=flag.slice('--tail-stems='.length);
 else throw new Error('Unknown or duplicate stem export option');
 if(stemsDirectory===''||postStemsDirectory===''||resumeAuditPath===''||archiveRepeatModelPath===''||rattleStemsDirectory===''||tailStemsDirectory==='')throw new Error('Explicit nonempty paths required');
}
if(!capture||!output||option!=='--pow-candidate'||extra.length>6)throw new Error('Usage: capture.json report.json --pow-candidate [--worker-stems=new-directory] [--post-stems=new-directory] [--rattle-stems=new-directory] [--tail-stems=new-directory] [--resume-audit=owned-resumes.jsonl] [--archive-repeat-model=source.json]');
const d=JSON.parse(fs.readFileSync(capture,'utf8'));
if(rattleStemsDirectory&&d.voiceRattleAudio!==true)throw new Error('Rattle export requires same-run Rattle capture');
let archiveRepeatModel,archiveRepeatModelSource;
if(archiveRepeatModelPath){
 if(d.earlyConsumer!==true)throw new Error('Archive envelope source requires consumer coverage from zero');
 const bytes=fs.readFileSync(archiveRepeatModelPath);archiveRepeatModel=JSON.parse(bytes);
 if(archiveRepeatModel.schema!==1||archiveRepeatModel.presetSha256!==crypto.createHash('sha256').update(fs.readFileSync(archiveRepeatModel.presetPath)).digest('hex'))throw new Error('Archive model preset identity hash mismatch');
 archiveRepeatModelSource={path:archiveRepeatModelPath,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),modelIdentity:archiveRepeatModel.modelIdentity,presetSha256:archiveRepeatModel.presetSha256,runtimeModeSupplied:archiveRepeatModel.runtimeMode};
}
const consumerInjection=d.consumerInjection===true,sourceCommits=d.sourceCommits===true;
const commitSlotCoverage=sourceCommits?validateCommitSlots(d,resumeAuditPath?fs.readFileSync(resumeAuditPath,'utf8').trim().split('\n').map(line=>JSON.parse(line)):undefined):undefined;
let sourceCommitCount=0,modalCommitCount=0,sourceSkipCount=0,lateGlobalDifferences=0,sourcePending,sourcePhase,sourceConsumerAge;
const rattleAudioControls=new Map();
const consumerDelay=d.consumerDelay===true,consumerSources=new Map(),consumerVoices=new Map(),consumerCompared=new Map(),consumerOutputs=[];let consumerPreBlocks=0,consumerComparedBlocks=0,consumerCalculatedBlocks=0;
const workerOutputs=d.workerOutputs===true,dispatchAgesByVoice=new Map(),pendingRefreshByVoice=new Map(),transportTailsByVoice=new Map();let outputSamples=0,postStateBlocks=0,emptyVoiceBypassBlocks=0;
const dispatchControls=d.dispatchControls===true,dispatchAges=[],skippedRefreshAges=[];let pendingRefreshAge;
const windowBlocks=d.windowBlocks??8;if(!Number.isInteger(windowBlocks)||windowBlocks<1||windowBlocks>512)throw new Error('Supported explicit window length required');const windowEnd=64*windowBlocks;const expectedBlocks=workerOutputs?d.envelopeBlocks:windowBlocks;if(workerOutputs&&!dispatchControls)throw new Error('Worker output mode requires dispatch controls');
if(consumerDelay&&!sourceCommits&&(!workerOutputs||d.fixedSites!==false||d.transitions?.length!==(consumerInjection?2:1)||d.transitions[0].afterInitializations!==5||d.transitions[0].weightsSeen!==10||d.transitions[0].activeSites!==6||d.transitions[0].consumerAddress!=='0x100460908'))throw new Error('Exact six-site consumer transition required');
if(consumerInjection&&!sourceCommits&&(d.injectionEntryObserved!==false||[['before','injectionMixed','0x1000fbe50']].some(([removedStage,addedStage,address],i)=>{const t=d.transitions[i+1];return t.removedStage!==removedStage||t.addedStage!==addedStage||t.address!==address||t.afterInitializations!==5||t.weightsSeen!==10||t.activeSites!==6;})))throw new Error('Exact six-site injection transition required');
if(d.schema!==1||(!consumerDelay&&d.fixedSites!==true)||d.siteCount!==6||!d.complete||d.pending||d.activeSites!==0||d.errors.length||d.starts!==5||d.spectrumCount!==10||d.finalCount!==5||(!dispatchControls&&d.refreshCount!==windowBlocks)||d.renderCount!==expectedBlocks||!d.copyCount||d.initializations!==0||!d.envelopeBlocks||d.envelopePending||!d.coefficientCount)throw new Error('Complete dynamic Rattle capture required');
const f=Math.fround,view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite x/control');view.setFloat32(0,x);return view.getUint32(0);};
const owners=new Map(),voices=new Map(),pending=new Map(),epochs=new Set(),failures=[],byStage={},mismatchesByName={};const modes=new Map();let spectrumCalls=0,finalCalls=0;const histories=new Map(),mathCalls=[];const math={exp2f:x=>{const y=nativeScalarExp2f(x);mathCalls.push({function:'exp2f',input:x,output:y});return y;},log10f:x=>{const y=nativeScalarLog10f(x);mathCalls.push({function:'log10f',input:x,output:y});return y;}};const powCalls=[];const postMath={pow:(x,y)=>{const output=Math.pow(x,y);powCalls.push({input:x,exponent:y,output});return output;}};let historyUpdates=0,randomDraws=0,phaseRandomDraws=0,modeSeedBridges=0;const sourceModels=new Map(),copied=new Map(),predictions=new Map(),producerChecks=new Set();let copies=0,oldReleasesComputed=0;const runtimes=new Map(),envelopes=new Map(),envelopePending=new Map(),envelopeCompleted=new Map(),coeffState=new Map();let blocks=0,duplicates=0;let checks=0,mismatches=0,starts=0,updates=0,coefficients=0,active=0,xChanges=0;
let comparisonContext;
function check(name,p,a){checks++;if(bits(p)!==bits(a)){mismatches++;mismatchesByName[name]=(mismatchesByName[name]??0)+1;if(failures.length<100)failures.push({name,predicted:p,actual:a,predictedBits:bits(p),actualBits:bits(a),context:comparisonContext});}}
function checkDouble(name,p,a){checks++;doubleChecks++;if(!Number.isFinite(p)||!Number.isFinite(a))throw new Error('Nonfinite double control/state');if(!Object.is(p,a)){mismatches++;mismatchesByName[name]=(mismatchesByName[name]??0)+1;if(failures.length<100)failures.push({name,predicted:p,actual:a});}}
function compareOnset(own,target){
 if(!target||['remaining','settle','delay','square','filtered'].some(k=>own[k]!==target[k]))throw new Error('Onset counters or branch state differs');
 for(const k of ['sine','cosine'])checkDouble('onset:'+k,own[k],target[k]);
 own.history.forEach((x,i)=>check('onset:history',x,target.history[i]));
}
function voice(r){const s=voices.get(r.epoch);if(!s||s.voice!==r.voice||owners.get(r.voice)!==r.epoch)throw new Error('Unbound voice epoch');if(r.modal&&BigInt(r.modal)!==BigInt(r.voice)+0x168n)throw new Error('Invalid modal owner');return s;}
function consumerConfig(controls){
 if(!controls||controls.spread!==1||typeof controls.mute!=='boolean'||!Number.isInteger(controls.bleedFlag)||!Number.isFinite(controls.bleedGain)||controls.bleedFlag===1&&controls.bleedGain>1e-8)throw new Error('Consumer spread/redistribution branch not yet verified');
}
function compareDelayStates(label,own,targets){
 if(own.length!==targets?.length)throw new Error('Complete consumer delay targets required');
 for(let g=0;g<own.length;g++){
  const state=own[g],target=targets[g];
  for(const key of ['length','elapsed','remaining'])if(state[key]!==target[key])throw new Error(`Consumer delay ${key} differs`);
  for(const key of ['writeGain','dryGain','target','multiplier'])check(label+':'+key,state[key],target[key]);
  if(target.ring){if(target.ring.length!==state.ring.length)throw new Error('Complete ring target required');target.ring.forEach((x,i)=>{if(state.elapsed>=state.length||i<state.elapsed)check(label+':ring',state.ring[i],x);});}
 }
}
function consumerUntil(epoch,end){
 const own=consumerVoices.get(epoch);if(!own||end<own.age||end%64)throw new Error('Consumer source chronology required');
 while(own.age<end){
  const source=consumerSources.get(`${epoch}:${own.age}`);if(!source)throw new Error('Missing own worker block for consumer');
  const input=own.mute?source.map(()=>new Float32Array(64)):source;
  const output=input.map((group,i)=>renderVoiceDelay(group,own.states[i]));
  own.outputs.set(own.age,output);consumerOutputs.push({epoch,counter:own.age,channels:output.map(x=>Array.from(x))});own.age+=64;consumerCalculatedBlocks++;
 }
 return own;
}
for(const r of d.records){
 comparisonContext={stage:r.stage,epoch:r.epoch,age:r.target?.sample_counter??r.counter};
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
  const x=f(r.sourceX);voices.set(starts,{voice:r.voice,owner:r.owner,initial:x,current:x,rattle:sourceCommits?new RattleControlState(x):undefined,newVelocity:f(inputs.newVelocity)});owners.set(r.voice,starts);const runtime=new DynamicReleaseVoice(x);runtimes.set(starts,runtime);envelopes.set(starts,runtime.envelope);coeffState.set(starts,{duration:0,rate:0,gain:0});starts++;
 }else if(r.stage==='rattleSource'){
  const s=voice(r);if(!sourceCommits||sourcePending!==undefined||r.owner!==s.owner)throw new Error('Bound frozen source event required');
  const old=s.rattle.current,x=s.rattle.updateSource(r.frozenX);if(bits(old)!==bits(x))xChanges++;s.current=x;
  check('source:voice-x',x,r.currentX);sourcePending=r.epoch;sourceConsumerAge=r.consumerAge;sourcePhase='entry';sourceCommitCount++;
 }else if(r.stage==='rattleGate'){
  voice(r);if(!sourceCommits||sourcePending!==r.epoch||sourcePhase!==r.kind)throw new Error('Paired source dispatch gate required');
  const route=rattleDispatchRoute(r.kind,r.flag,r.multi);if(route!==r.route)throw new Error('Source dispatch route mismatch');sourcePhase=route;
 }else if(r.stage==='rattleSkip'){
  const s=voice(r);if(!sourceCommits||sourcePending!==r.epoch||sourcePhase!=='skip')throw new Error('Paired skipped source required');
  check('source:skipped-current',s.rattle.current,r.currentX);check('source:skipped-modal',s.rattle.modal,r.modalX);
  sourcePending=undefined;sourcePhase=undefined;sourceConsumerAge=undefined;sourceSkipCount++;
 }else if(r.stage==='rattleCommit'){
  const s=voice(r);if(!sourceCommits||sourcePending!==r.epoch||sourcePhase!=='commit')throw new Error('Paired modal commit required');
  let x;if(r.caller==='0x1007184b0')x=s.rattle.commitInitialization();
  else if(r.caller==='0x100460260'){
   x=s.rattle.commitRuntime();
   if(d.voiceRattleAudio){
    const key=`${r.epoch}:${sourceConsumerAge}`;
    if(!Number.isInteger(sourceConsumerAge)||sourceConsumerAge<0||sourceConsumerAge%64||rattleAudioControls.has(key))throw new Error('Unique Rattle consumer control commit required');
    rattleAudioControls.set(key,x);
   }
   sourcePending=undefined;sourcePhase=undefined;sourceConsumerAge=undefined;modalCommitCount++;
  }
  else throw new Error('Unknown modal commit caller');
  check('source:setter-input',x,r.argument);check('source:modal-store',x,r.modalX);runtimes.get(r.epoch).updateRattle(x);
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
  invocation.modes.set(input.mode,{supported,postInputs:r.postInputs,mergeControls:r.mergeControls,lateRandomInputs:r.lateRandomInputs,selectionSource:r.selectionSource,onsetInputs:r.onsetInputs});spectrumCalls++;
 }else if(r.stage==='copy'){
  voice(r);if([...envelopePending.values()].some(p=>p.epoch===r.epoch))throw new Error('Copy during unfinished envelope');
  if(r.render){
   if(workerOutputs)throw new Error('Worker output targets must come from worker');
   if(r.epoch!==0||r.counter!==64*comparedOutputBlocks||r.render.samples!==64||r.counter>=windowEnd)throw new Error('Noncontiguous completed output window');
   const raw=modalOutputs.get(r.counter);if(!raw||raw.length!==r.render.channels.length)throw new Error('Missing computed complete modal block');
   if(!transportTails)transportTails=raw.map(()=>new Float32Array(Math.floor(r.render.delay/4)*4));
   const transported=transportModalBlock(raw,r.render.delay,transportTails);transportTails=transported.tails;
   const output=redistributeModalGroups(bypassPostModalProcessor(transported.output,r.render.processor),r.render.spread);
   for(let group=0;group<output.length;group++){if(r.render.channels[group].length!==64)throw new Error('Incomplete completed output channel');for(let i=0;i<64;i++)check('continuous:output',output[group][i],r.render.channels[group][i]);}
   continuousOutputs.push({counter:r.counter,channels:output.map(x=>Array.from(x))});comparedOutputBlocks++;outputSamples+=output.length*64;
  }
  if(consumerDelay){
   const pre=r.consumerPre;if(!pre)throw new Error('Consumer pre-state required');consumerConfig(pre.controls);
   let own=consumerVoices.get(r.epoch);
   if(!own){
    if(r.counter!==0||pre.delays.length!==3||pre.delays.some(state=>state.elapsed!==0||state.ring?.length!==state.length))throw new Error('Unwritten initial consumer delay state required');
    own={age:0,mute:pre.controls.mute,states:pre.delays.map(state=>({...state,ring:new Float32Array(state.length)})),outputs:new Map()};consumerVoices.set(r.epoch,own);
   }
   if(own.mute!==pre.controls.mute)throw new Error('Consumer mute transition not yet verified');
   consumerUntil(r.epoch,r.counter);compareDelayStates('consumer-pre',own.states,pre.delays);consumerPreBlocks++;
  }else if(r.consumerPre)throw new Error('Unexpected consumer pre-state');
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
  mappedRandomState.forEach((value,i)=>{checks++;randomWordChecks++;if(value!==r.randomState[i]){mismatches++;mismatchesByName['initial-random-state']=(mismatchesByName['initial-random-state']??0)+1;if(failures.length<100)failures.push({name:'initial-random-state',epoch:r.epoch,index:i,predicted:value,actual:r.randomState[i]});}});
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
  const timestep=f(1/first.selectionSource.sampleRate);check('initial:timestep',timestep,c['0xc']);
  const controls={timestep,pitch:c['0x780'],adjustmentRatio:c['0x784'],inputMode:0};
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
  const refreshed=refreshDampedModes(groups,{timestep:controls.timestep,pitch:controls.pitch,scale:c['0x7f8'],release:owned.rate,gain:owned.gain,extraGain:c['0x7e0'],releaseShape:c['0x7ec'],releaseLow:c['0x7f0'],releaseHigh:c['0x7f4'],blockLength:target.block_length_V768,blockFactor:target.block_factor_V810});
  check('initial:normalization',refreshed.normalization,c['0x7e8']);
  for(const [group,[start,,,count]] of selection.layout.entries())for(let i=0;i<groups[group].length;i++){
   const lane=start+i,row=targets.get(lane),state=states.get(lane),coeff=refreshed.groups[group][i];
   if(bits(positionWeights[lane])!==bits(row.position_weight))weightDiagnostics.push({epoch:r.epoch,lane,valid:row.valid,index:selection.indices[lane],frequency:mapped.frequency[lane],predicted:positionWeights[lane],actual:row.position_weight});
   check('initial:position-weight',positionWeights[lane],row.position_weight);
   state.Q=f(state.Q*coeff.radius);Object.assign(state,coeff,{frequency:mapped.frequency[lane],J:mapped.J[lane],modalDecay:mapped.decay[lane],weight:positionWeights[lane],sourceIndex:selection.indexStorage[lane]});
   check('mapped:frequency',mapped.frequency[lane],row.frequency);check('mapped:J',mapped.J[lane],row.J);check('mapped:decay',mapped.decay[lane],row.modal_decay);
   for(const name of ['P','Q','energy','S','K'])check('final:'+name,state[name],row[name]);
   check('final:sinInverse',state.sinInverse,row.sin_inverse);check('final:radius',state.radius,row.R);check('final:effectiveDecay',state.decay,row.effective_decay);check('final:A',state.A,row.A);check('final:B',state.B,row.B);
  }
  if(!first.onsetInputs||JSON.stringify(first.onsetInputs)!==JSON.stringify(second.onsetInputs))throw new Error('Paired onset source inputs required');
  const onsetParameters=modalOnsetDuration(first.onsetInputs,built.source,built.header,first.selectionSource.sampleRate);
  const onset=new ModalOnsetEnvelope({duration:onsetParameters.duration,square:first.onsetInputs.square,step:target.onset.step,coefficients:target.onset.coefficients});
  compareOnset(onset,target.onset);
  // 7c02e8 initializes P/Q and A/B throughout each padded group, beyond
  // the four-lane coefficient tail as well. These extra lanes are real input
  // to the eight-lane tail kernel, even when only four lanes remain.
  for(const [start,padded] of selection.layout)for(let lane=start;lane<padded;lane++)if(!states.has(lane))states.set(lane,{P:0,Q:0,A:0,B:0});
  initialStates.set(r.epoch,{positionWarmupBlocks:positionWeightWarmupBlocks(first.onsetInputs.noteIndex),positionWeightsReady:owned.gain!==0||c['0x7e0']!==0,normalization:refreshed.normalization,layout:selection.layout,controls,states,renderAge:0,readyAge:0,coefficientAge:0,referenceFrequency,cutoffIndex:lower,onset,onsetParameters});
  initialSnapshots.push({epoch:r.epoch,layout:selection.layout.map(x=>[...x]),controls:{...controls},lanes:[...states].map(([lane,state])=>({lane,...state}))});
  histories.set(r.voice,[...first.supported.history]);phaseRandomDraws+=built.phaseRandomDraws;
  pending.delete(r.epoch);finalCalls++;
 }else if(r.stage==='refresh'){
  voice(r);const st=initialStates.get(r.epoch),t=r.target,c=t.controls,age=t.sample_counter;
  if((!workerOutputs&&r.epoch!==0)||!st||age!==st.renderAge||(dispatchControls?age!==(workerOutputs?pendingRefreshByVoice.get(r.epoch):pendingRefreshAge):age!==64*(refreshes+1))||(!workerOutputs&&age>windowEnd)||t.initial_flag!==0||t.input_mode!==0||t.layout_flag!==0||t.energy_layout!==2)throw new Error('Noncontiguous complete refresh window required');
  compareOnset(st.onset,t.onset);
  if(workerOutputs){if(st.postPrunedAge!==age)throw new Error('Missing own completed-block pruning');}
  else{
  const pruned=updateModalEnergyAndPrune(st.states,st.layout,{threshold:t.prune_threshold,energyLayout:t.energy_layout,keepSlots:(t.keep_slots&1)!==0,freezeLayout:false});
  st.layout=pruned.layout;removals.push(...pruned.removed.map(row=>({age,...row})));
  }
  if(JSON.stringify(st.layout)!==JSON.stringify(t.groups))throw new Error('Computed continuous pruning layout differs');
  const controls={timestep:st.controls.timestep,pitch:c['0x780'],adjustmentRatio:c['0x784'],inputMode:0};
  check('refresh:timestep',controls.timestep,c['0xc']);
  const changed=controls.pitch!==st.controls.pitch||controls.adjustmentRatio!==st.controls.adjustmentRatio;
  for(const [start,,,count] of st.layout)for(let lane=start;lane<Math.ceil((start+count)/4)*4;lane+=4){
   const rows=Array.from({length:4},(_,i)=>st.states.get(lane+i));
   const angles=modalAngleGroup({...controls,frequency:rows.map(x=>x.frequency),pitchAdjustment:rows.map(x=>x.J)});
   if(changed){
    const projected=projectModalHistory({P:rows.map(x=>x.P),Q:rows.map(x=>x.Q),oldRadius:rows.map(x=>x.radius),oldCosine:rows.map(x=>x.K),oldSinInverse:rows.map(x=>x.sinInverse),newSine:angles.S,newCosine:angles.K});
    rows.forEach((row,i)=>{row.P=projected[i];});
   }
   rows.forEach((row,i)=>{row.K=angles.K[i];row.S=angles.S[i];row.sinInverse=angles.sinInverse[i];});
  }
  const size=Math.max(...st.layout.map(([,padded])=>padded)),frequency=new Float32Array(size),indexStorage=new Float32Array(size);
  for(const [lane,row] of st.states){frequency[lane]=row.frequency??0;indexStorage[lane]=row.sourceIndex??0;}
  check('refresh:referenceFrequency',st.referenceFrequency,r.positionInputs.referenceFrequency);
  if(st.cutoffIndex!==r.positionInputs.cutoffIndex)throw new Error('Carried source cutoff differs');
  const owned=coeffState.get(r.epoch);check('refresh:release-rate',owned.rate,c['0x7e4']);check('refresh:position-gain',owned.gain,c['0x7b0']);
  const positionWarmupDue=!st.positionWeightsReady&&age>=64*st.positionWarmupBlocks;
  const weights=owned.gain===0&&c['0x7e0']===0&&!positionWarmupDue?undefined:modalPositionWeights({...r.positionInputs,referenceFrequency:st.referenceFrequency,cutoffIndex:st.cutoffIndex,frequency,indexStorage,layout:st.layout});
  if(weights)st.positionWeightsReady=true;
  if(weights)for(const [start,,,count] of st.layout)for(let lane=start;lane<Math.ceil((start+count)/4)*4;lane++)st.states.get(lane).weight=weights[lane];
  const groups=st.layout.map(([start,,,count])=>Array.from({length:Math.ceil(count/4)*4},(_,i)=>{const row=st.states.get(start+i);return {modalDecay:row.modalDecay,energy:row.energy,cosine:row.K,weight:row.weight,frequency:row.frequency,active:i<count};}));
  const damped=refreshDampedModes(groups,{timestep:controls.timestep,pitch:controls.pitch,scale:c['0x7f8'],release:owned.rate,gain:owned.gain,extraGain:c['0x7e0'],releaseShape:c['0x7ec'],releaseLow:c['0x7f0'],releaseHigh:c['0x7f4'],blockLength:t.block_length_V768,blockFactor:t.block_factor_V810});
  if(owned.gain!==0)st.normalization=damped.normalization;
  check('refresh:normalization',st.normalization,c['0x7e8']);
  let n=0;
  for(const [g,[start,,,count]] of st.layout.entries())for(let i=0;i<Math.ceil(count/4)*4;i++){
   const lane=start+i,row=st.states.get(lane),a=t.lanes[n++];if(!a||a.lane!==lane||a.group!==g)throw new Error('Incomplete refresh lane targets');
   Object.assign(row,damped.groups[g][i]);comparisonContext={...comparisonContext,lane};
   for(const name of ['P','Q','energy','S','K','A','B'])check('refresh:'+name,row[name],a[name]);
   for(const [name,target] of [['frequency','frequency'],['J','J'],['modalDecay','modal_decay'],['weight','position_weight'],['sinInverse','sin_inverse'],['radius','R'],['decay','effective_decay']])check('refresh:'+name,row[name],a[target]);
  }
  if(n!==t.lanes.length)throw new Error('Extra refresh targets');st.controls=controls;st.readyAge=age;st.coefficientAge=age;refreshes++;if(dispatchControls){if(workerOutputs)pendingRefreshByVoice.delete(r.epoch);else pendingRefreshAge=undefined;}
 }else if(r.stage==='coefficients'){
  const s=voice(r);if(r.owner!==s.owner||!Number.isFinite(r.sourceX)||r.sourceX<0||r.sourceX>1)throw new Error('Invalid global Rattle source');
  const x=sourceCommits?s.rattle.modal:f(r.sourceX);
  if(sourceCommits){if(bits(r.sourceX)!==bits(s.rattle.current))lateGlobalDifferences++;check('coefficient:voice-x',s.rattle.current,r.currentX);}
  else{if(bits(x)!==bits(s.current))xChanges++;s.current=x;check('coefficient:voice-x',x,r.currentX);}
  runtimes.get(r.epoch).updateRattle(x);check('coefficient:modal-x',x,r.modalX);
  if(!Number.isInteger(r.releaseFlag)||r.releaseFlag<0||r.releaseFlag>255)throw new Error('Invalid release flag');
  const enabled=(r.releaseFlag&1)!==0||x>0;
  const v=runtimes.get(r.epoch).refresh({model:r.inputs,u:r.u,releaseFlag:r.releaseFlag});
  if(enabled)active++;
  for(const k of ['duration','rate','gain'])check(k,v[k],r.actual[k]);coeffState.set(r.epoch,v);epochs.add(r.epoch);coefficients++;
  if(dispatchControls){
   if(!r.dispatch||typeof r.dispatch.required!=='boolean'||![0,1].includes(r.dispatch.flag)||r.dispatch.required!==(r.dispatch.flag===1)||r.dispatch.factor!==1||r.dispatch.phase!==0||![0,1].includes(r.dispatch.initial)||r.counter!==runtimes.get(r.epoch).envelope.samplesProcessed)throw new Error('Complete dispatch decision required');
   check('dispatch:committed-u',r.u,r.dispatch.committedU);
   if(workerOutputs){
    const age=r.counter,ages=dispatchAgesByVoice.get(r.epoch)??[];
    if(age!==ages.length*64||pendingRefreshByVoice.has(r.epoch))throw new Error('Missing all-voice dispatch or refresh');ages.push(age);dispatchAgesByVoice.set(r.epoch,ages);
    if(age===0){if(r.dispatch.initial!==1||!r.dispatch.required)throw new Error('Initial all-voice dispatch required');}
    else if(r.dispatch.required){if(r.dispatch.initial!==0||r.skippedState)throw new Error('Invalid all-voice refresh decision');pendingRefreshByVoice.set(r.epoch,age);}
    else{
     const st=initialStates.get(r.epoch),t=r.skippedState;
     if(!st||st.renderAge!==age||st.postPrunedAge!==age||!t||r.dispatch.initial!==0||JSON.stringify(st.layout)!==JSON.stringify(t.groups))throw new Error('Missing own pruned state at skipped refresh');
     let n=0;
     for(const [g,[start,,,count]] of st.layout.entries())for(let i=0;i<Math.ceil(count/4)*4;i++){
      const lane=start+i,row=st.states.get(lane),a=t.lanes[n++];if(!a||a.lane!==lane||a.group!==g)throw new Error('Incomplete all-voice skipped lanes');
      comparisonContext={...comparisonContext,lane};for(const key of ['P','Q','A','B','frequency','modalDecay','J','K','S','sinInverse','radius','energy','weight'])check('skipped:'+key,row[key],a[key]);
     }
     if(n!==t.lanes.length)throw new Error('Extra all-voice skipped lanes');st.readyAge=age;skippedRefreshAges.push({epoch:r.epoch,age});
    }
   }else if(r.epoch===0&&r.counter<=windowEnd){
    const age=r.counter;if(age!==dispatchAges.length*64||pendingRefreshAge!==undefined)throw new Error('Missing dispatch or required refresh');dispatchAges.push(age);
    if(age===0){if(r.dispatch.initial!==1||!r.dispatch.required)throw new Error('Initial dispatch required');}
    else if(r.dispatch.required){if(r.dispatch.initial!==0||r.skippedState)throw new Error('Invalid refresh dispatch');pendingRefreshAge=age;}
    else{
     const st=initialStates.get(0),t=r.skippedState;
     if(!st||age!==st.renderAge||!t||r.dispatch.initial!==0)throw new Error('Missing skipped-refresh state');
     const pruned=updateModalEnergyAndPrune(st.states,st.layout,{threshold:t.threshold,energyLayout:t.energyLayout,keepSlots:(t.keepSlots&1)!==0,freezeLayout:false});
     st.layout=pruned.layout;removals.push(...pruned.removed.map(row=>({age,...row})));
     if(JSON.stringify(st.layout)!==JSON.stringify(t.groups))throw new Error('Skipped-refresh pruning layout differs');
     let n=0;
     for(const [g,[start,,,count]] of st.layout.entries())for(let i=0;i<Math.ceil(count/4)*4;i++){
      const lane=start+i,row=st.states.get(lane),a=t.lanes[n++];if(!a||a.lane!==lane||a.group!==g)throw new Error('Incomplete skipped-refresh lanes');
      comparisonContext={...comparisonContext,lane};for(const key of ['P','Q','A','B','frequency','modalDecay','J','K','S','sinInverse','radius','energy','weight'])check('skipped:'+key,row[key],a[key]);
     }
     if(n!==t.lanes.length)throw new Error('Extra skipped-refresh lanes');st.readyAge=age;skippedRefreshAges.push(age);
    }
   }else if(r.skippedState)throw new Error('Unexpected skipped-refresh targets');
  }else if(r.dispatch||r.skippedState)throw new Error('Unexpected dispatch metadata');
 }else if(r.stage==='envelopeResult'){
  voice(r);const runtime=runtimes.get(r.epoch),env=runtime.envelope,c=coeffState.get(r.epoch);
  check('envelope:duration',c.duration,r.duration);
  if(((env.samplesProcessed+r.samples)>>>0)!==r.counter)throw new Error('Envelope counter discontinuity');
  if(workerOutputs||r.epoch===0&&r.counter<=windowEnd){
   const st=initialStates.get(r.epoch);if(!st||st.renderAge+r.samples!==r.counter||st.readyAge!==st.renderAge||r.samples!==64)throw new Error('Missing own initial state or refresh before render');
   tailTwelveGroups+=st.layout.filter(([,,,count])=>(Math.ceil(count/4)*4)%16===12).length;
   const output=renderModalVoiceBlock(st.states,st.layout,r.samples),onset=workerOutputs&&st.layout.every(([,,,count])=>count===0)?null:st.onset.process(r.samples);
   if(onset)for(const channel of output)for(let i=0;i<channel.length;i++)channel[i]=f(channel[i]*onset[i]);
   if(workerOutputs){
    const target=r.render,t=r.postState;if(!target||target.samples!==64||!t||target.channels.length!==output.length)throw new Error('Complete worker output and post-state targets required');
    const tails=transportTailsByVoice.get(r.epoch)??output.map(()=>new Float32Array(Math.floor(target.delay/4)*4));
    const empty=st.layout.every(([,,,count])=>count===0);if(empty)emptyVoiceBypassBlocks++;
    const transported=empty?{output,tails}:transportModalBlock(output,target.delay,tails);transportTailsByVoice.set(r.epoch,transported.tails);
    const completed=bypassPostModalProcessor(transported.output,target.processor);
    for(let group=0;group<completed.length;group++){if(target.channels[group].length!==64)throw new Error('Incomplete worker channel');for(let i=0;i<64;i++)check('continuous:output',completed[group][i],target.channels[group][i]);}
    if(consumerDelay)consumerSources.set(`${r.epoch}:${st.renderAge}`,completed.map(x=>Float32Array.from(x)));
    continuousOutputs.push({epoch:r.epoch,counter:st.renderAge,channels:completed.map(x=>Array.from(x))});comparedOutputBlocks++;outputSamples+=completed.length*64;
    const pruned=updateModalEnergyAndPrune(st.states,st.layout,{threshold:t.threshold,energyLayout:t.energyLayout,keepSlots:(t.keepSlots&1)!==0,freezeLayout:false});
    st.layout=pruned.layout;removals.push(...pruned.removed.map(row=>({epoch:r.epoch,age:r.counter,...row})));
    if(JSON.stringify(st.layout)!==JSON.stringify(t.groups))throw new Error('Worker post-block pruning layout differs');
    let n=0;
    for(const [g,[start,,,count]] of st.layout.entries())for(let i=0;i<Math.ceil(count/4)*4;i++){
     const lane=start+i,row=st.states.get(lane),a=t.lanes[n++];if(!a||a.lane!==lane||a.group!==g)throw new Error('Incomplete post-block lane targets');comparisonContext={...comparisonContext,lane};
     for(const key of ['P','Q','energy'])check('post:'+key,row[key],a[key]);
    }
    if(n!==t.lanes.length)throw new Error('Extra post-block lanes');st.postPrunedAge=r.counter;postStateBlocks++;
   }else{if(r.render||r.postState)throw new Error('Unexpected worker targets');modalOutputs.set(st.renderAge,output);}
   st.renderAge=r.counter;renderedBlocks++;
  }
  const value=runtime.process({samples:r.samples,baseDuration:r.baseDuration,timestep:r.timestep});
  check('envelope:after',value,r.position);envelopeCompleted.set(r.thread,r);blocks++;
 }else if(['injectionEntry','injectionMixed','consumerPost','consumerCross',...(d.earlyConsumer?['groupControl','groupControlAfter']:[]),...(d.voiceRattleAudio?['audioGain','audioEntry','audioReturn']:[]),...(d.voiceTailEnvelopes?['audioAfterGains','audioTail']:[])].includes(r.stage)){
  voice(r);if(!consumerInjection)throw new Error('Unexpected injection observation');
 }else if(r.stage==='consumer'){
  voice(r);if(!consumerDelay)throw new Error('Unexpected consumer target');consumerConfig(r.controls);
  const previous=consumerCompared.get(r.epoch);if(r.counter%64||previous!==undefined&&r.counter!==previous+64)throw new Error('Noncontiguous consumer targets');
  const own=consumerUntil(r.epoch,r.counter+64);if(own.mute!==r.controls.mute)throw new Error('Consumer mute transition not yet verified');
  const output=own.outputs.get(r.counter);if(!output||r.channels.length!==output.length)throw new Error('Complete consumer channels required');
  for(let g=0;g<output.length;g++){if(r.channels[g].length!==64)throw new Error('Complete consumer samples required');for(let i=0;i<64;i++)check('consumer:output',output[g][i],r.channels[g][i]);}
  compareDelayStates('consumer-after',own.states,r.delays);consumerCompared.set(r.epoch,r.counter);consumerComparedBlocks++;
 }else if(r.stage==='duplicateEnvelopeResult'){
  voice(r);const p=envelopeCompleted.get(r.thread);
  if(envelopePending.has(r.thread)||!p||p.epoch!==r.epoch||p.voice!==r.voice||p.modal!==r.modal||p.counter!==r.counter||bits(p.position)!==bits(r.position))throw new Error('Unproven duplicate return');
  duplicates++;
 }else throw new Error('Unknown update stage');
}
if(renderedBlocks!==expectedBlocks||comparedOutputBlocks!==expectedBlocks||refreshes!==(dispatchControls?d.refreshCount:windowBlocks)||initialStates.size!==5||!initialGroups||modeSeedBridges!==5||powCalls.length!==5||histories.size!==5||historyUpdates!==4||!randomDraws||sourceModels.size!==0||finalCalls!==5||oldReleasesComputed!==4||producerChecks.size!==5||copies!==d.copyCount||starts!==5||voices.size!==5||epochs.size!==5||spectrumCalls!==10||modes.size!==5||[...modes.values()].some(m=>m.size!==2)||duplicates!==(d.duplicateEnvelopeReturns??0)||blocks!==d.envelopeBlocks||envelopePending.size||coefficients!==d.coefficientCount||!active||!xChanges||pending.size)throw new Error('Incomplete dynamic update chain');
if(!workerOutputs&&dispatchControls&&(dispatchAges.length!==windowBlocks+1||refreshes+skippedRefreshAges.length!==windowBlocks||pendingRefreshAge!==undefined))throw new Error('Incomplete conditional refresh decisions');
if(workerOutputs&&(pendingRefreshByVoice.size||dispatchAgesByVoice.size!==5||[...dispatchAgesByVoice].some(([epoch,ages])=>initialStates.get(epoch).renderAge!==ages.length*64)||refreshes+skippedRefreshAges.length!==expectedBlocks-5||postStateBlocks!==expectedBlocks))throw new Error('Incomplete all-voice worker chain');
if(consumerDelay&&(consumerVoices.size!==5||consumerCompared.size!==5||consumerPreBlocks!==copies||consumerComparedBlocks!==d.records.filter(r=>r.stage==='consumer').length))throw new Error('Incomplete consumer verification chain');
const consumerCoverage=[];
if(consumerDelay)for(const [epoch,own] of consumerVoices){
 const pre=d.records.filter(r=>r.stage==='copy'&&r.epoch===epoch),after=d.records.filter(r=>r.stage==='consumer'&&r.epoch===epoch);
 if(after.at(-1).counter<pre.at(-1).counter||epoch===4&&after[0].counter!==0)throw new Error('Consumer output observation boundary missing');
 consumerUntil(epoch,Math.max(pre.at(-1).counter,after.at(-1).counter)+64);
 consumerCoverage.push({epoch,calculatedBlocks:own.age/64,preStateObservations:pre.length,outputObservations:after.length,firstOutputAge:after[0].counter,lastOutputAge:after.at(-1).counter});
}
if(sourceCommits&&(sourcePending!==undefined||!sourceCommitCount||sourceCommitCount!==modalCommitCount+sourceSkipCount))throw new Error('Incomplete actual source commits');
const initialPredictions=initialSnapshots;
const finalVoiceStates=[...initialStates].map(([epoch,s])=>({epoch,sampleAge:s.renderAge,readyAge:s.readyAge,coefficientAge:s.coefficientAge,positionWeightWarmupBlocks:s.positionWarmupBlocks,positionWeightsReady:s.positionWeightsReady,layout:s.layout,controls:s.controls,onsetParameters:s.onsetParameters,lanes:[...s.states].map(([lane,state])=>({lane,...state}))}));
const injectionStartChecks=checks,injectionStartMismatches=mismatches;
const injection=consumerInjection?verifyConsumerInjection(d,consumerOutputs,check,context=>{comparisonContext=context;},archiveRepeatModel):undefined;
if(injection){injection.checks=checks-injectionStartChecks;injection.mismatches=mismatches-injectionStartMismatches;injection.passed=injection.mismatches===0;}
const crossStartChecks=checks,crossStartMismatches=mismatches;
const cross=dataConsumerCross();
function dataConsumerCross(){if(d.consumerCross!==true)return;const result=verifyConsumerCross(d,injection,check,context=>{comparisonContext=context;});result.checks=checks-crossStartChecks;result.mismatches=mismatches-crossStartMismatches;result.passed=result.mismatches===0;return result;}
const rattleStartChecks=checks,rattleStartMismatches=mismatches;
const rattleAudio=d.voiceRattleAudio?verifyVoiceRattleAudio(d,cross,rattleAudioControls,check,context=>{comparisonContext=context;}):undefined;
if(rattleAudio){rattleAudio.checks=checks-rattleStartChecks;rattleAudio.mismatches=mismatches-rattleStartMismatches;rattleAudio.passed=rattleAudio.mismatches===0;}
const tailStartChecks=checks,tailStartMismatches=mismatches;
const tailEnvelopes=d.voiceTailEnvelopes?verifyVoiceTailEnvelopes(d,rattleAudio,check,checkDouble,context=>{comparisonContext=context;}):undefined;
if(tailEnvelopes){tailEnvelopes.checks=checks-tailStartChecks;tailEnvelopes.mismatches=mismatches-tailStartMismatches;tailEnvelopes.passed=tailEnvelopes.mismatches===0;}
const report={passed:!mismatches,tailEnvelopes,archiveRepeatModelSource,sourceCommits,sourceCommitCount,modalCommitCount,sourceSkipCount,sourceDispatchControlsObserved:sourceCommits,lateGlobalDifferences,commitSlotCoverage,consumerInjection,injection,cross,rattleAudio,consumerUnwrittenRingIgnored:true,consumerDelay,consumerCoverage,fullConsumerTailImplemented:false,finalStereoAudioVerified:false,consumerPreBlocks,consumerComparedBlocks,consumerCalculatedBlocks,consumerOutputSamples:consumerComparedBlocks*3*64,consumerFirstCompared:[...consumerVoices].map(([epoch])=>({epoch,age:d.records.find(r=>r.stage==='consumer'&&r.epoch===epoch).counter})),consumerOutputs,workerOutputs,postStateBlocks,emptyVoiceBypassBlocks,voiceBlockCounts:[...dispatchAgesByVoice].map(([epoch,ages])=>({epoch,blocks:ages.length})),dispatchGateObserved:dispatchControls,dispatchGateIndependentlyComputed:false,dispatchControls,dispatchAges,skippedRefreshAges,tailTwelveGroups,boundedWindow:!workerOutputs,windowBlocks:workerOutputs?undefined:windowBlocks,windowEnd:workerOutputs?undefined:windowEnd,finalVoiceStates,continuousOutputs,renderedBlocks,comparedOutputBlocks,continuousOutputSamples:outputSamples,refreshes,removals,onsetDurationComputedFromSource:true,onsetStatesCarried:true,onsetDoubleStepAndFilterCoefficientsObserved:true,continuousInitialStatesComputed:true,continuousModalStatesCarried:true,workerAndConsumerClocksKeptSeparate:true,lateCopyPQNotUsed:true,weightDiagnostics,initialPredictions,checks,comparedFloatValues:checks-randomWordChecks-doubleChecks,comparedDoubleValues:doubleChecks,comparedRandomWords:randomWordChecks,initializationRandom,initializationRandomControlsObserved:initializationRandom.length===starts,initializationRandomOutputsNotDirectlyCompared:true,randomStateAtInitialVerified:!mismatchesByName['initial-random-state'],mismatches,modelInitializations:sourceModels.size,starts,spectrumCalls,finalCalls,spectrumRows:d.records.filter(r=>r.stage==='weights').reduce((n,r)=>n+r.count,0),copyCount:copies,oldReleasesComputed,envelopeBlocks:blocks,duplicateEnvelopeReturns:duplicates,coefficients,active,xChanges,byStage,sourceControlObserved:true,globalXAtCoefficientObserved:true,dynamicUpdateSiteNotObservedThisWindow:!sourceCommits,setterSiteNotObservedThisWindow:!sourceCommits,envelopeStatesCarried:true,envelopeDurationComputed:true,baseDurationAndTimestepObserved:true,modelInitializationSiteNotObservedThisWindow:true,coefficientModelFieldsObserved:true,coefficientTargetsComparisonOnly:true,activeCubeSiteNotObservedThisWindow:true,releaseFlagAndUObserved:true,oldReleaseInputComputed:true,browserCompatibleRuntimeModuleUsed:true,browserCompatibleSpectrumModuleUsed:true,hardnessRepeatInputsComputed:true,spectrumHardnessComputed:true,logSpectrumComputed:true,logSpectrumSiteNotObservedThisWindow:true,hardnessScalarSiteNotObservedThisWindow:true,spectrumModelTablesAndOtherControlsObserved:true,expWeightsComputedAndCompared:true,weightedSourceComputedAsIntermediate:true,mergedExcitationSourceCompared:false,mergedSourceIntermediateComputed:true,modeSelectionComputed:true,nativeScalarLog2Implemented:true,selectionControlsObserved:true,mappedArraysComputed:true,nativeIndexAndLayoutComparisonOnly:true,rawInitialPQComputed:true,initialRadiiComputed:true,initialDampedQComputed:true,initialPositionWeightsObserved:false,initialPositionWeightsComputed:true,positionAndRolloffControlsObserved:true,positionReferenceAndCutoffComputed:true,nativeVectorCosImplemented:true,nativeIndexNotObservedThisWindow:true,energyNormalizationComputedFromOwnEnergy:true,initialReleaseRateAndGainComputed:true,pitchAndAdjustmentRatioObserved:true,timestepComputedFromSampleRate:true,initialGroups,perModeFinalSiteNotObservedThisWindow:true,postAndMergeComputed:true,phaseVariationComputed:true,weightedSiteNotObservedThisWindow:true,preWeightSourceStillObserved:true,nativeCosfFiniteRangeLimit:2**26,historyUpdates,randomDraws,supportHistoryVoices:histories.size,historyBetweenStrikesComputed:true,initialRandomStatePerVoiceObserved:true,primaryToSecondarySeedComputed:true,modeSeedBridges,phaseRandomDraws,secondFamilyGateObserved:true,nativeExp2fLog10fImplemented:true,historyMathCandidatesUsed:false,mathCalls,powCalls,doublePowCandidateUsed:true,powCandidateExplicit:true,browserCosfCandidateUsed:false,hardnessSourceAndCurvesObserved:true,oldVoiceSelectionCountVelocityAndHistoryObserved:true,continuousEnvelopeAndVoiceOrBrowserEquivalence:false,mismatchesByName,failures};if(tailStemsDirectory)report.voiceTailStems=report.passed?writeVoiceTailStems(d,report,tailStemsDirectory):{exported:false,reason:'Complete replay failed'};if(rattleStemsDirectory)report.voiceRattleStems=report.passed?writeVoiceRattleStems(d,report,rattleStemsDirectory):{exported:false,reason:'Complete replay failed'};if(postStemsDirectory)report.postConsumerStems=report.passed?writePostConsumerStems(d,report,postStemsDirectory):{exported:false,reason:'Complete replay failed'};if(stemsDirectory)report.workerStems=writeWorkerStems(report,stemsDirectory,d.records.find(r=>r.stage==='weights').selectionSource.sampleRate);fs.writeFileSync(output,stringifyWithNegativeZero(report,2)+'\n');console.log(JSON.stringify({...report,tailEnvelopes:tailEnvelopes?{...tailEnvelopes,outputs:undefined}:undefined,rattleAudio:rattleAudio?{...rattleAudio,outputs:undefined,births:rattleAudio.births.length}:undefined,cross:cross?{...cross,outputs:undefined}:undefined,injection:injection?{...injection,outputs:undefined}:undefined,consumerOutputs:undefined,mathCalls:undefined,powCalls:undefined,initialPredictions:undefined,finalVoiceStates:undefined,continuousOutputs:undefined}));if(!report.passed)process.exitCode=1;
