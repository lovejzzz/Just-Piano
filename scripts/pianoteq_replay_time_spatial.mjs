// Same-run time-envelope -> spatial tail; upstream audio is still observed.
import fs from 'node:fs';
import {combineThenRestoreGroups,spatializeVoiceGroups,distributeAuxiliary} from '../dsp/voice-spatial-output.mjs';
import crypto from 'node:crypto';
import path from 'node:path';
import {archiveTimeEnvelopeAtKnot} from '../dsp/archive-time-envelope.mjs';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
import {initializeTerminalVoiceEnvelope,renderTerminalVoiceEnvelope,renderVoiceTimeEnvelope} from '../dsp/voice-tail-envelopes.mjs';
const [capturePath,auditPath,reportPath,option,...extra]=process.argv.slice(2);
if(!capturePath||!auditPath||!reportPath||option!=='--exp-candidate'||extra.length>1||extra.length&&!extra[0].startsWith('--archive-time-source='))throw new Error('Usage: complete-component.json owned-resumes.jsonl new-report.json --exp-candidate [--archive-time-source=decoded-source.json]');
const archive=extra.length?JSON.parse(fs.readFileSync(extra[0].slice('--archive-time-source='.length))):null;
if(archive){
 if(archive.schema!==1||archive.presetSha256!==crypto.createHash('sha256').update(fs.readFileSync(archive.presetPath)).digest('hex'))throw new Error('Verified archive time preset required');
 if(!fs.readFileSync(path.join(path.dirname(capturePath),'commands.lldb'),'utf8').includes('--fxp '+archive.presetPath+' --midi '))throw new Error('Exact archive capture preset required');
}
const data=JSON.parse(fs.readFileSync(capturePath)),resumes=fs.readFileSync(auditPath,'utf8').trim().split('\n').map(x=>JSON.parse(x));
if(!data.complete||data.errors?.length||!data.timeSpatialComponent||data.fixedSites||data.siteCount!==6||data.pending||data.voices!==5||data.sources!==5||data.models!==5)throw new Error('Complete six-slot time/spatial component required');
const points={selection:0x1007181d8,model:0x100718230,entry:0x10030bd30,before:0x10030c104,gains:0x100460f08,time:0x100460f1c,nonlinear:0x1004610a8,filtered:0x1004610c8,expanded:0x100461120};
const fixed=['selection','model','entry','before','gains'];
const registry=new Map([...fixed.map((role,i)=>[i+1,role]),[6,'time']]);
const auditKeys=new Set();let lastStop=-1;
for(const e of resumes){if(!Number.isInteger(e.stopId)||e.stopId<=lastStop)throw new Error('Ordered Continue audit required');lastStop=e.stopId;for(const t of e.threads){const s=t.lastOwned;if(s&&[s.fileAddress,s.fileAddress+4].includes(Number(t.pc))&&s.stopId<=e.stopId)auditKeys.add(`${t.thread}:${s.id}:${s.stopId}`);}}
let transitionIndex=0,maxId=6;
for(let i=0;i<data.records.length;i++){
 const r=data.records[i];if(registry.get(r.site?.id)!==r.stage||r.site.fileAddress!==points[r.stage]||!auditKeys.has(`${r.thread}:${r.site.id}:${r.site.stopId}`))throw new Error('Unaudited registered six-slot observation');
 const t=data.transitions[transitionIndex];
 if(t?.afterRecord===i+1){
  const next={time:'nonlinear',nonlinear:'filtered',filtered:'expanded',expanded:'time'}[r.stage];
  if(t.oldRole!==r.stage||t.newRole!==next||t.oldId!==r.site.id||t.stopId!==r.site.stopId||t.fileAddress!==points[next]||t.newId<=maxId||t.registered!==6||t.active!==6)throw new Error('Invalid deferred spatial slot transition');
  registry.delete(t.oldId);registry.set(t.newId,t.newRole);maxId=t.newId;transitionIndex++;if(registry.size!==6)throw new Error('Six registered slots required');
 }
}
if(data.slotPending!==null||transitionIndex!==data.transitions.length||transitionIndex!==5*data.windowBlocks*4-1)throw new Error('Complete deferred spatial transition coverage required');
const states=new Map(),pending=new Map(),predictions=[],failures=[];
let checks=0,mismatches=0,doubleChecks=0,context,primaryActiveBlocks=0,secondaryActiveBlocks=0,timeChangedSamples=0,gainChangedSamples=0,postAttackBlocks=0;
const view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Finite component floats required');view.setFloat32(0,x);return view.getUint32(0);};
const check=(name,p,a,double=false)=>{checks++;if(double)doubleChecks++;if(double?!Object.is(p,a):bits(p)!==bits(a)){mismatches++;if(failures.length<40)failures.push({name,predicted:p,actual:a,context});}};
const exact=(name,p,a)=>check(name,Number(p===a),1);
function compareTime(p,a){for(const k of ['enabled','delay','attack','decay','counter'])exact('time:'+k,p[k],a[k]);for(const k of ['attackRate','decayRate','value'])check('time:'+k,p[k],a[k],true);}
function compareTerminal(p,a){for(const part of ['primary','secondary'])for(const k of Object.keys(p[part]))check(part+':'+k,p[part][k],a[part][k]);compareTime(p.time,a.time);}
function matrices(name,p,a){if(p?.length!==3||a?.length!==3)throw new Error('Three aligned rows required');for(let r=0;r<3;r++){if(p[r].length!==64||a[r].length!==64)throw new Error('Aligned 64-sample rows required');for(let i=0;i<64;i++)check(name,p[r][i],a[r][i]);}}
function changed(a,b){let n=0;for(let r=0;r<3;r++)for(let i=0;i<64;i++)if(bits(a[r][i])!==bits(b[r][i]))n++;return n;}
const word32=new DataView(new ArrayBuffer(4));const fromBits=x=>{word32.setUint32(0,x);return word32.getFloat32(0);};
function spatialState(s){
 if(s.rows?.length!==3||s.fade.counter!==0)throw new Error('Three initialized spatial rows required');
 const rows=s.rows.map(row=>{
  if(row.tapWords.length!==20||row.words[4]!==row.words[5]*4)throw new Error('Five-tap spatial source required');
  const taps=Array.from({length:5},(_,i)=>({start:row.tapWords[i*4],end:row.tapWords[i*4+1],c:fromBits(row.tapWords[i*4+2]),g:fromBits(row.tapWords[i*4+3])}));
  const state={vectors:row.words[5],counter:taps[0].end,taps,ring:new Float32Array(row.words[4])};
  if(!row.ring||row.ring.length!==state.ring.length)throw new Error('Observed initial ring required');
  row.ring.forEach((v,i)=>check('initial-spatial-ring',state.ring[i],v));return state;
 });
 return {rows,fade:{...s.fade},model:structuredClone(s)};
}
function compareSpatial(own,r){
 const s=r.spatial,v=own.spatial;if(!s||s.rows.length!==3||s.rowGains.slice(0,3).length!==3||s.rowGains.slice(0,3).some(g=>g!==1)||s.controls['0x29f8']!==0||s.controls['0x29fc']!==0)throw new Error('Unsupported spatial level or nonlinearity');
 for(const [k,val] of Object.entries({'0x88':1,'0xb0':1,'0xbc':1,'0xbd':0,'0xfc':1}))if(s.flags[k]!==val)throw new Error('Unsupported spatial branch');
 for(const k of Object.keys(v.model.controls))check('spatial-control:'+k,v.model.controls[k],s.controls[k]);
 for(const k of ['start','duration','secondsPerSample'])check('spatial-fade:'+k,v.fade[k],s.fade[k]);
 exact('spatial-fade-counter',v.fade.counter,s.fade.counter);
 s.rows.forEach((row,j)=>{exact('spatial-counter',v.rows[j].counter,row.words[8]);if(JSON.stringify(row.tapWords)!==JSON.stringify(v.model.rows[j].tapWords))throw new Error('Changing spatial taps unsupported');if(row.ring){if(row.ring.length!==v.rows[j].ring.length)throw new Error('Complete spatial ring required');row.ring.forEach((n,i)=>check('spatial-ring',v.rows[j].ring[i],n));}});
}
function compareGroups(name,p,actual){if(p.length!==3||actual?.length!==3)throw new Error('Three output groups required');for(let g=0;g<3;g++){const a=actual[g];if(a.rows!==p[g].length||a.samples!==64||a.values.length!==p[g].length)throw new Error('Complete spatial matrix required');for(let row=0;row<p[g].length;row++){if(a.values[row].length!==64)throw new Error('Complete spatial samples required');for(let i=0;i<64;i++)check(name,p[g][row][i],a.values[row][i]);}}}
for(const r of data.records){
 context={stage:r.stage,epoch:r.epoch,counter:r.counter};
 if(r.stage==='selection'){
  if(r.counter!==0||r.epoch!==states.size||states.has(r.epoch))throw new Error('Unique model selection from age zero required');
  const s={...r.source};
  if(archive){
   const model=archiveTimeEnvelopeAtKnot({editFields:archive.editFields,note:r.note});
   for(const k of ['globalAttack','legatoAttack']){check('archive:'+k,model[k],r.source[k]);s[k]=model[k];}
  }
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
 if(['nonlinear','filtered','expanded'].includes(r.stage)){
  if(r.stage==='nonlinear'){
   if(p.phase!=='time')throw new Error('Time endpoint missing before merge');
   compareGroups('merged-groups',[p.merged.combined,...p.result.groups.slice(1)].map(g=>[g]),r.groups);
   matrices('merge-aux-preserved',p.result.auxiliary,r.auxiliary.values);compareSpatial(own,r);
   if(p.merged.groups.some(g=>Math.max(...g.map(Math.abs))<1e-7))throw new Error('Silent spatial-group branch not verified');
   p.spatial=spatializeVoiceGroups(p.merged.groups,own.spatial.rows,own.spatial.fade);p.phase='nonlinear';
  }else if(r.stage==='filtered'){
   if(p.phase!=='nonlinear')throw new Error('Merge endpoint missing');
   compareGroups('filtered-groups',p.spatial,r.groups);matrices('filtered-aux-preserved',p.result.auxiliary,r.auxiliary.values);compareSpatial(own,r);
   const split=distributeAuxiliary(p.spatial[0],p.result.auxiliary,own.spatial.model.controls['0x94']);
   p.expanded=[split.primary,...p.spatial.slice(1)];p.auxiliary=split.auxiliary;p.phase='filtered';
  }else{
   if(p.phase!=='filtered')throw new Error('Spatial endpoint missing');
   compareGroups('expanded-groups',p.expanded,r.groups);matrices('expanded-auxiliary',p.auxiliary,r.auxiliary.values);compareSpatial(own,r);
   predictions.push({epoch:r.epoch,counter:r.counter,channels:p.result.groups.map(g=>Array.from(g)),spatialGroups:p.expanded.map(g=>g.map(row=>Array.from(row))),auxiliary:p.auxiliary.map(g=>Array.from(g))});own.age+=64;pending.delete(r.thread);
  }
  continue;
 }
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
  if(!own.spatial)own.spatial=spatialState(r.spatial);
  compareSpatial(own,r);compareGroups('time-matrix',p.result.groups.map(g=>[g]),r.groups);
  p.merged=combineThenRestoreGroups(p.result.groups);p.phase='time';
 }else throw new Error('Unknown component stage');
}
if(pending.size||states.size!==5||[...states.values()].some(s=>s.age!==data.windowBlocks*64)||!timeChangedSamples||!postAttackBlocks)throw new Error('Actual shaping and post-attack coverage required');
const report={passed:!mismatches,checks,mismatches,doubleChecks,blocks:predictions.length,voices:5,windowBlocks:data.windowBlocks,primaryActiveBlocks,secondaryActiveBlocks,timeChangedSamples,gainChangedSamples,postAttackBlocks,models:[...states].map(([epoch,s])=>({epoch,selectedDuration:s.selected,attackSamples:s.time.attack,attackRate:s.time.attackRate,finalCounter:s.time.counter})),selectedDurationAndSampleCountComputed:true,globalTimeFieldsFromArchive:!!archive,terminalInitialGainComputed:true,timeInitialWrittenFieldsComputed:true,timeInitialUnwrittenValueObserved:true,expDoubleCandidateUsed:true,observedAudioInput:true,terminalModelAndEnableInputsObserved:true,spatialStateCarried:true,spatialCoefficientsObserved:true,timeToSpatialSameRun:true,fullVoiceSourceComputed:false,finalStereoAudioVerified:false,predictions,failures};
fs.writeFileSync(reportPath,stringifyWithNegativeZero(report,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,predictions:undefined,failures:undefined}));if(!report.passed)process.exitCode=1;
