// Bounded component validation; every audio input is observed in this run.
import fs from 'node:fs';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
import {initializeTerminalVoiceEnvelope,renderTerminalVoiceEnvelope,renderVoiceTimeEnvelope} from '../dsp/voice-tail-envelopes.mjs';
const [capturePath,auditPath,reportPath,option,...extra]=process.argv.slice(2);
if(!capturePath||!auditPath||!reportPath||option!=='--exp-candidate'||extra.length)throw new Error('Usage: complete-component.json owned-resumes.jsonl new-report.json --exp-candidate');
const data=JSON.parse(fs.readFileSync(capturePath)),resumes=fs.readFileSync(auditPath,'utf8').trim().split('\n').map(x=>JSON.parse(x));
if(!data.complete||data.errors?.length||!data.activeTimeComponent||!data.fixedSites||data.siteCount!==6||data.pending||data.voices!==5||data.sources!==5||data.models!==5)throw new Error('Complete six-site active-time component required');
const points={selection:0x1007181d8,model:0x100718230,entry:0x10030bd30,before:0x10030c104,gains:0x100460f08,time:0x100460f1c},roles=Object.keys(points);
const audited=new Set();let stop=-1;
for(const e of resumes){
 if(!Number.isInteger(e.stopId)||e.stopId<=stop)throw new Error('Ordered Continue audit required');stop=e.stopId;
 for(const t of e.threads){const s=t.lastOwned;if(s&&[s.fileAddress,s.fileAddress+4].includes(Number(t.pc))&&s.stopId<=e.stopId)audited.add(`${t.thread}:${s.id}:${s.stopId}`);}
}
const states=new Map(),pending=new Map(),predictions=[],failures=[];
let checks=0,mismatches=0,doubleChecks=0,context,primaryActiveBlocks=0,secondaryActiveBlocks=0,timeChangedSamples=0,gainChangedSamples=0,postAttackBlocks=0;
const view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Finite component floats required');view.setFloat32(0,x);return view.getUint32(0);};
const check=(name,p,a,double=false)=>{checks++;if(double)doubleChecks++;if(double?!Object.is(p,a):bits(p)!==bits(a)){mismatches++;if(failures.length<40)failures.push({name,predicted:p,actual:a,context});}};
const exact=(name,p,a)=>check(name,Number(p===a),1);
function compareTime(p,a){for(const k of ['enabled','delay','attack','decay','counter'])exact('time:'+k,p[k],a[k]);for(const k of ['attackRate','decayRate','value'])check('time:'+k,p[k],a[k],true);}
function compareTerminal(p,a){for(const part of ['primary','secondary'])for(const k of Object.keys(p[part]))check(part+':'+k,p[part][k],a[part][k]);compareTime(p.time,a.time);}
function matrices(name,p,a){if(p?.length!==3||a?.length!==3)throw new Error('Three aligned rows required');for(let r=0;r<3;r++){if(p[r].length!==64||a[r].length!==64)throw new Error('Aligned 64-sample rows required');for(let i=0;i<64;i++)check(name,p[r][i],a[r][i]);}}
function changed(a,b){let n=0;for(let r=0;r<3;r++)for(let i=0;i<64;i++)if(bits(a[r][i])!==bits(b[r][i]))n++;return n;}
for(const r of data.records){
 context={stage:r.stage,epoch:r.epoch,counter:r.counter};
 if(r.site?.fileAddress!==points[r.stage]||r.site.id!==roles.indexOf(r.stage)+1||!audited.has(`${r.thread}:${r.site.id}:${r.site.stopId}`))throw new Error('Unaudited fixed hardware observation');
 if(r.stage==='selection'){
  if(r.counter!==0||r.epoch!==states.size||states.has(r.epoch))throw new Error('Unique model selection from age zero required');
  const s=r.source;
  if(!Object.values(s).every(Number.isFinite)||s.sampleRate<=0||r.initialTime.counter!==0)throw new Error('Finite model source and zero initial counter required');
  let selected=Math.fround(s.overrideDuration!==0?s.overrideDuration:s.globalAttack);if(s.legato>0)selected=Math.fround(s.legatoAttack);
  const enabled=s.globalDelay!==0||selected!==0||s.globalEnd<10?1:0;
  if(!enabled||selected<0)throw new Error('Actual active time-model selection required');
  const samples=Math.trunc(Math.fround(selected*Math.fround(s.sampleRate)));
  if(samples>0xffffffff)throw new Error('Model duration outside uint32 range');
  const time={...r.initialTime,enabled,delay:0,attack:samples,decay:0,counter:0,attackRate:samples?Math.exp(-0.9942522733438669/samples):0,decayRate:1};
  states.set(r.epoch,{voice:r.voice,age:0,selected,sampleRate:s.sampleRate,time,sourceSeen:true,modelSeen:false});continue;
 }
 const own=states.get(r.epoch);if(!own||own.voice!==r.voice)throw new Error('Unbound time-model voice');
 if(r.stage==='model'){if(own.modelSeen||r.counter!==0)throw new Error('One model initialization required');check('model:selected-duration',own.selected,r.selectedDuration);own.modelSeen=true;continue;}
 if(r.stage==='entry'){
  if(!own.modelSeen||r.counter!==own.age||pending.has(r.thread))throw new Error('Contiguous component entry required');pending.set(r.thread,{epoch:r.epoch,counter:r.counter,voice:r.voice,phase:'entry',own});continue;
 }
 const p=pending.get(r.thread);if(!p||p.epoch!==r.epoch||p.counter!==r.counter||p.voice!==r.voice||r.auxiliary?.rows!==3||r.auxiliary.samples!==64)throw new Error('Complete bound audio phase required');
 if(r.stage==='before'){
  if(p.phase!=='entry'||r.tail.special)throw new Error('Unsupported component precondition');
  if(!own.terminal){own.terminal={};for(const part of ['primary','secondary'])own.terminal[part]=initializeTerminalVoiceEnvelope(own.sampleRate,r.tail[part].slope,r.tail[part].scale);}
  for(const part of ['primary','secondary'])own.terminal[part].enabled=r.tail[part].enabled;
  compareTerminal({...own.terminal,time:own.time},r.tail);
  let result={groups:r.channels.map(g=>Float32Array.from(g)),auxiliary:r.auxiliary.values.map(g=>Float32Array.from(g))};
  if(r.tail.secondaryEnabled===1){result=renderTerminalVoiceEnvelope(result.groups,result.auxiliary,own.terminal.secondary);secondaryActiveBlocks++;}
  if(r.counter>r.tail.activationAge&&!(own.terminal.primary.enabled&1))own.terminal.primary.enabled=1;
  if(own.terminal.primary.enabled||own.terminal.primary.gain!==1)primaryActiveBlocks++;
  result=renderTerminalVoiceEnvelope(result.groups,result.auxiliary,own.terminal.primary);
  gainChangedSamples+=changed(result.groups,r.channels)+changed(result.auxiliary,r.auxiliary.values);
  p.result=result;p.phase='before';
 }else if(r.stage==='gains'){
  if(p.phase!=='before')throw new Error('Gain stage missing');
  matrices('gains:groups',p.result.groups,r.channels);matrices('gains:auxiliary',p.result.auxiliary,r.auxiliary.values);compareTerminal({...own.terminal,time:own.time},r.tail);
  if(own.time.counter>=own.time.delay+own.time.attack+own.time.decay)postAttackBlocks++;
  const result=renderVoiceTimeEnvelope(p.result.groups,p.result.auxiliary,own.time);
  timeChangedSamples+=changed(result.groups,p.result.groups)+changed(result.auxiliary,p.result.auxiliary);p.result=result;p.phase='gains';
 }else if(r.stage==='time'){
  if(p.phase!=='gains')throw new Error('Time stage missing');
  matrices('time:groups',p.result.groups,r.channels);matrices('time:auxiliary',p.result.auxiliary,r.auxiliary.values);compareTerminal({...own.terminal,time:own.time},r.tail);
  predictions.push({epoch:r.epoch,counter:r.counter,channels:p.result.groups.map(g=>Array.from(g)),auxiliary:p.result.auxiliary.map(g=>Array.from(g))});own.age+=64;pending.delete(r.thread);
 }else throw new Error('Unknown component stage');
}
if(pending.size||states.size!==5||[...states.values()].some(s=>s.age!==data.windowBlocks*64)||!timeChangedSamples||!postAttackBlocks)throw new Error('Actual shaping and post-attack coverage required');
const report={passed:!mismatches,checks,mismatches,doubleChecks,blocks:predictions.length,voices:5,windowBlocks:data.windowBlocks,primaryActiveBlocks,secondaryActiveBlocks,timeChangedSamples,gainChangedSamples,postAttackBlocks,models:[...states].map(([epoch,s])=>({epoch,selectedDuration:s.selected,attackSamples:s.time.attack,attackRate:s.time.attackRate,finalCounter:s.time.counter})),selectedDurationAndSampleCountComputed:true,terminalInitialGainComputed:true,timeInitialWrittenFieldsComputed:true,timeInitialUnwrittenValueObserved:true,expDoubleCandidateUsed:true,observedAudioInput:true,terminalModelAndEnableInputsObserved:true,fullVoiceSourceComputed:false,finalStereoAudioVerified:false,predictions,failures};
fs.writeFileSync(reportPath,stringifyWithNegativeZero(report,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,predictions:undefined,failures:undefined}));if(!report.passed)process.exitCode=1;
