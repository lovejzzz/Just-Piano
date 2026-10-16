import fs from 'node:fs';
import {repeatedStrikeControl} from '../dsp/repeated-strike-control.mjs';
import {excitationHardness} from '../dsp/excitation-hardness.mjs';
const [capturePath,reportPath,option,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||option!=='--cosf-candidate'||extra.length)throw new Error('Usage: capture.json report.json --cosf-candidate');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(data.schema!==1||data.fixedSites!==true||data.errors?.length||!data.complete||data.activeSites!==0||data.producerCount!==5||data.hardnessCount!==10)throw new Error('Complete fixed-site offline five-strike window required');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite result');view.setFloat32(0,x);return view.getUint32(0);};
let count=0,mismatches=0,ordinal=0,pending=null,expCalls=0,activeRepeats=0,hardnessCalls=0,transition=0,expiredOldVoices=0;
const states=new Map(),failures=[],predictions=[];
function compare(name,p,a,integer=false){count++;if(integer?p!==a:bits(p)!==bits(a)){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
function phase(next,index){
 const expected=['before','after','hardness'];
 const t=data.transitions[transition++];if(!t||t.next!==next||t.recordCount!==index||t.activeSites!==expected.length||JSON.stringify([...t.enabled].sort())!==JSON.stringify([...expected].sort()))throw new Error('Invalid fixed hardware phase');
}
phase('idle',0);
for(const [index,r] of data.records.entries()){
 if(r.stage==='before'){
  if(pending||r.ordinal!==ordinal++||states.has(r.newVoice)||r.note!==69)throw new Error('Invalid old/new voice chronology');
  if(r.inputs.old&&Math.fround(Math.fround(r.inputs.old.duration)*Math.fround(r.inputs.hostRate))<=Math.fround(r.inputs.old.count))expiredOldVoices++;
  const computed=repeatedStrikeControl(r.inputs);if(computed.exp)expCalls++;pending={...r,computed,expStage:'none'};states.set(r.newVoice,{...pending,modes:new Set()});phase('producer',index+1);
 }else if(r.stage==='after'){
  if(!pending||r.ordinal!==pending.ordinal||r.thread!==pending.thread||r.newVoice!==pending.newVoice||!['none','done'].includes(pending.expStage))throw new Error('Incomplete repeated-strike producer');
  const p=pending.computed;compare('repeatFlag',p.repeatFlag,r.actual.repeatFlag,true);
  for(const key of ['age','oldVelocity','attenuation'])compare(key,p[key],r.actual[key]);
  if(p.history.length!==r.actual.history.length)throw new Error('Inherited history shape differs');
  p.history.forEach((v,i)=>compare('history:'+i,v,r.actual.history[i]));
  if(p.repeatFlag)activeRepeats++;predictions.push({ordinal:pending.ordinal,...p});pending=null;phase('idle',index+1);
 }else if(r.stage==='hardness'){
  const state=states.get(r.newVoice),input=r.input;
  if(pending||!state||state.thread!==r.thread||input.note!==state.note||![0,1].includes(input.mode)||state.modes.has(input.mode))throw new Error('Unbound or duplicated hardness consumer');
  state.modes.add(input.mode);const p=state.computed;
  for(const key of ['repeatFlag','age','attenuation'])compare('consumer:'+key,p[key],input.controls[key],key==='repeatFlag');
  // Producer values drive the consumer. Native controls and scalar outputs
  // remain comparison-only; source tables, hardness curves and cosf remain
  // explicit observed/candidate boundaries.
  const result=excitationHardness({...input,controls:{...input.controls,repeatFlag:p.repeatFlag,age:p.age,attenuation:p.attenuation}},{cosf:x=>Math.fround(Math.cos(x))});
  for(const key of ['primary','secondary','referenceFrequency'])compare('hardness:'+key,result[key],r.actual[key]);hardnessCalls++;
 }else throw new Error('Unknown repeated-strike record');
}
if(pending||ordinal!==5||hardnessCalls!==data.hardnessCount||states.size!==5||[...states.values()].some(s=>!s.modes.has(0)||!s.modes.has(1))||transition!==data.transitions.length)throw new Error('Incomplete strike, primary consumer, or phase coverage');
if(activeRepeats!==4||expCalls!==3||expiredOldVoices!==0)throw new Error('Offline fast stimulus coverage differs');
const report={profile:'fixed-offline-fast',expiredOldVoices,passed:!mismatches,count,matched:count-mismatches,mismatches,strikes:ordinal,activeRepeats,computedExpCalls:expCalls,hardnessCalls,
 hardwareTransitions:transition,maxActiveHardwarePoints:3,producerGateAgeAttenuationAndHistoryCopyComputed:true,producerTargetsComparisonOnly:true,
 consumerRepeatInputsComputed:true,oldVoiceSelectionAndStateObserved:true,inheritedHistoryProductionNotComputed:true,
 hardnessSourceAndCurvesObserved:true,nativeScalarCosfImplemented:false,browserCosfCandidateExplicit:true,
 nativeExpTargetsNotCaptured:true,offlineControlAndHardnessWindowCaptured:true,independentVoiceAudioNotComputed:true,completeVoiceOrBrowserEquivalence:false,failures,predictions};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
