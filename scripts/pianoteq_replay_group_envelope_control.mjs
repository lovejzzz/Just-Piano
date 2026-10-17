import fs from 'node:fs';
import path from 'node:path';
import {activateVoiceGroupEnvelope,renderVoiceGroupEnvelope} from '../dsp/voice-group-envelope.mjs';
import {observationResumeKeys} from './pianoteq_validate_commit_slots.mjs';
const [capture,report]=process.argv.slice(2);
if(!capture||!report)throw new Error('Usage: complete-capture.json report.json');
const d=JSON.parse(fs.readFileSync(capture));
if(!d.complete||d.schema!==1||d.siteCount!==5||!d.fixedSites||d.activeSites||d.errors.length||d.pending||d.voices!==5)throw new Error('Complete five-site capture required');
const audit=fs.readFileSync(path.join(path.dirname(capture),'owned-resumes.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const audited=observationResumeKeys(d.records,audit),addresses={birth:0x10035ef10,control:0x1006edcf8,controlAfter:0x1006edd74,apply:0x100428784,applyAfter:0x100428850};
const states=new Map(),pending=new Map(),ids=new Map(),failures=[],outputs=[];
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{if(!Number.isFinite(x))throw new Error('Finite float required');view.setFloat32(0,x);return view.getUint32(0);};
let checks=0,mismatches=0,controls=0,reactivations=0,activeNoops=0,blocks=0,context;
function check(name,p,a,float=false){checks++;if(float?bits(p)!==bits(a):p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a,context});}}
function stateCheck(s,t){for(const key of ['gain','step','rate'])check(key,s[key],t[key],true);for(const key of ['active','elapsed','duration'])check(key,s[key],t[key]);}
function groupsCheck(p,a){if(a?.length!==3||a.some(g=>g.length!==64))throw new Error('Three aligned endpoint groups required');p.forEach((g,i)=>g.forEach((v,j)=>check('output',v,a[i][j],true)));}
for(const r of d.records){
 context={stage:r.stage,epoch:r.epoch,counter:r.counter};
 if(r.site?.fileAddress!==addresses[r.stage]||!audited.has(`${r.thread}:${r.site.id}:${r.site.stopId}`))throw new Error('Audited fixed site required');
 if(!ids.has(r.stage)){if([...ids.values()].includes(r.site.id))throw new Error('Reused fixed site ID');ids.set(r.stage,r.site.id);}
 if(ids.get(r.stage)!==r.site.id)throw new Error('Changed fixed site ID');
 if(r.stage==='birth'){
  if(states.has(r.epoch))throw new Error('Duplicate birth');
  // Birth precedes configuration writes. Initial dynamic state is asserted
  // at first application; only rate/duration are taken as model inputs there.
  states.set(r.epoch,null);continue;
 }
 if(!states.has(r.epoch))throw new Error('Missing birth');
 let s=states.get(r.epoch);
 if(!s){
  if(r.stage!=='apply'||r.counter!==0)throw new Error('First application at zero required');
  s={gain:1,step:0,active:0,elapsed:0,rate:r.state.rate,duration:r.state.duration};states.set(r.epoch,s);
 }
 if(r.stage==='control'||r.stage==='apply'){
  if(pending.has(r.thread))throw new Error('Overlapping call');stateCheck(s,r.state);
  const item={stage:r.stage,epoch:r.epoch,counter:r.counter};
  if(r.stage==='control'){
   if(!states.has(r.newEpoch)||r.newEpoch<=r.epoch)throw new Error('New voice identity required');
   controls++;if(s.active&1)activeNoops++;else{if(s.gain!==1)reactivations++;}
   activateVoiceGroupEnvelope(s,r.strength);
  }else{
   if(r.channels?.length!==3||r.channels.some(g=>g.length!==64||!g.every(Number.isFinite)))throw new Error('Complete observed source groups required');
   item.channels=renderVoiceGroupEnvelope(r.channels,s);blocks++;
  }
  pending.set(r.thread,item);
 }else{
  const item=pending.get(r.thread);if(!item||r.stage!==item.stage+'After'||r.epoch!==item.epoch||r.counter!==item.counter)throw new Error('Unpaired return');
  stateCheck(s,r.state);
  if(item.channels){groupsCheck(item.channels,r.channels);outputs.push({epoch:r.epoch,counter:r.counter,channels:item.channels.map(g=>Array.from(g))});}
  pending.delete(r.thread);
 }
}
if(pending.size||states.size!==5||[...states.values()].some(s=>!s)||!controls||!reactivations||ids.size!==5)throw new Error('Incomplete controller trajectory');
const result={passed:mismatches===0,checks,mismatches,controls,reactivations,activeNoops,blocks,outputSamples:blocks*192,initialGainComputed:true,gainCarried:true,stepComputed:true,modelRateDurationObserved:true,strengthObserved:true,audioInputsObserved:true,fullVoiceChainConnected:false,finalStereoAudioVerified:false,observationResumes:audit.length,failures,outputs};
fs.writeFileSync(report,JSON.stringify(result));
console.log(JSON.stringify({...result,outputs:undefined}));if(!result.passed)process.exitCode=1;
