import fs from 'node:fs';
import {RattleControlState} from '../dsp/rattle-control-state.mjs';
const [input,output,...extra]=process.argv.slice(2);
if(!input||!output||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(input));
if(data.schema!==1||!data.pilot||!data.windowComplete||data.errors.length||data.pending||data.activeSites!==0||data.siteCount!==4||!data.commits||data.commits>data.limit)throw new Error('Completed source commit capture required');
const completion=data.completion??(data.commits===data.limit?'limit':undefined);
if(!['limit','native-exit'].includes(completion)||completion==='limit'&&data.commits!==data.limit)throw new Error('Explicit completion boundary required');
const states=new Map(),owners=new Map(),view=new DataView(new ArrayBuffer(4)),failures=[];let checks=0,sources=0,commits=0,workers=0,copies=0,pending,mainThread,ownerBound=true;
const bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite control target');view.setFloat32(0,x);return view.getUint32(0);};
const check=(name,a,b,r)=>{checks++;if(bits(a)!==bits(b))failures.push({name,a,b,stage:r.stage,epoch:r.epoch,stopId:r.site.stopId});};
const transitions=new Map();
for(const t of data.transitions){
 if(t.registered!==4||t.active!==4||!Number.isInteger(t.afterRecord)||t.afterRecord<1||t.afterRecord>data.records.length||transitions.has(t.afterRecord))throw new Error('Invalid four-slot transition');
 transitions.set(t.afterRecord,t);
}
let slotMode='source',slotId,sourceChanges=0,slotTransitions=0;const workerAges=new Map();
for(const [index,r] of data.records.entries()){
 if(!r.site||!Number.isInteger(r.site.stopId)||!Number.isInteger(r.site.id)||!Number.isInteger(r.thread))throw new Error('Owned event coordinates required');
 let s=states.get(r.epoch);
 if(r.stage==='birth'){
  if(s||r.epoch!==states.size||owners.has(r.voice))throw new Error('Unique voice birth required');
  mainThread??=r.thread;if(mainThread!==r.thread)throw new Error('Main-thread ownership required');
  s={voice:r.voice,owner:r.owner,state:new RattleControlState(r.sourceX)};states.set(r.epoch,s);owners.set(r.voice,r.epoch);
 }else{
  if(!s||s.voice!==r.voice||owners.get(r.voice)!==r.epoch)throw new Error('Unbound voice event');
  if(r.stage==='source'){
   if(r.thread!==mainThread||pending||slotMode!=='source'||r.site.fileAddress!==0x10085ed9c||slotId!==undefined&&r.site.id!==slotId)throw new Error('Invalid frozen-source phase');
   if(r.owner&&s.owner){if(r.owner!==s.owner)throw new Error('Source owner changed');}else ownerBound=false;
   const old=s.state.current,x=s.state.updateSource(r.frozenX);if(bits(old)!==bits(x))sourceChanges++;
   check('source-cache',x,r.currentX,r);sources++;pending={epoch:r.epoch,voice:r.voice};
  }else if(r.stage==='setter'){
   if(r.thread!==mainThread||!pending||pending.epoch!==r.epoch||slotMode!=='setter'||r.site.fileAddress!==0x10051182c||r.site.id!==slotId)throw new Error('Unpaired modal commit');
   let x;
   if(r.caller==='0x1007184b0')x=s.state.commitInitialization();
   else if(r.caller==='0x100460260'){x=s.state.commitRuntime();pending=undefined;commits++;}
   else throw new Error('Unknown setter caller');
   check('setter-input',x,r.argument,r);check('modal-store',x,r.modalX,r);
  }else if(r.stage==='worker'||r.stage==='copy'){
   check(r.stage+':source-cache',s.state.current,r.voiceX,r);check(r.stage+':modal-cache',s.state.modal,r.modalX,r);
   if(r.stage==='worker'){
    const ages=workerAges.get(r.epoch)??[];if(r.workerAge!==ages.length*64)throw new Error('Missing worker source observation');ages.push(r.workerAge);workerAges.set(r.epoch,ages);workers++;
   }else copies++;
  }else throw new Error('Unknown source trace stage');
 }
 const t=transitions.get(index+1);
 if(t){
  if(!['source','setter'].includes(r.stage)||t.oldId!==r.site.id||t.newId===t.oldId)throw new Error('Transition not bound to current owned point');
  const expected=r.stage==='source'?'setter':'source';if(t.mode!==expected||t.address!==(expected==='setter'?'0x10051182c':'0x10085ed9c'))throw new Error('Wrong slot destination');
  if(r.stage==='setter'&&r.caller!=='0x100460260')throw new Error('Initialization setter cannot finish runtime pair');
  slotMode=t.mode;slotId=t.newId;slotTransitions++;
 }else if(r.stage==='source'||r.stage==='setter'&&r.caller==='0x100460260'&&!(completion==='limit'&&commits===data.limit&&index===data.records.length-1))throw new Error('Missing required slot transition');
}
if(pending||sources!==commits||commits!==data.commits||slotTransitions!==data.transitions.length||!workers||!copies||completion==='native-exit'&&states.size!==5)throw new Error('Incomplete source commit sequence');
const report={passed:failures.length===0,checks,mismatches:failures.length,failures,voices:states.size,sources,commits,workers,copies,sourceChanges,initializationSetterObservations:data.records.filter(r=>r.stage==='setter'&&r.caller==='0x1007184b0').length,slotTransitions,completion,ownerBound,sourceInput:'Frozen s0 from R load, not H/V comparison snapshots',separateSourceAndModalState:true,fullAudioEquivalence:false,completePhysicsVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
