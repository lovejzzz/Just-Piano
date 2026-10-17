import path from 'node:path';
import {observationResumeKeys} from './pianoteq_validate_commit_slots.mjs';
import fs from 'node:fs';
import {initializeRattleBurst,renderRattleBurst} from '../dsp/rattle-burst.mjs';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
const [capturePath,reportPath,auditOption,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length||auditOption&&!auditOption.startsWith('--resume-audit='))throw new Error('Usage: complete-capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath));
if(!data.complete||data.schema!==1||data.siteCount!==2||!data.fixedSites||data.activeSites||data.errors.length||data.pending||data.voices!==5||!data.observedPrimaryInputs||!data.observedSourceTables)throw new Error('Complete two-point Rattle capture required');
const word=new DataView(new ArrayBuffer(4));
const bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite compared float');word.setFloat32(0,x);return word.getUint32(0);};
const fromBits=x=>{if(!Number.isInteger(x)||x<0||x>0xffffffff)throw new Error('Float32 target word required');word.setUint32(0,x);return word.getFloat32(0);};
const auditPath=auditOption?auditOption.slice('--resume-audit='.length):path.join(path.dirname(capturePath),'owned-resumes.jsonl');
const resumes=fs.readFileSync(auditPath,'utf8').trim().split('\n').map(line=>JSON.parse(line));
const audited=observationResumeKeys(data.records,resumes),siteIds=new Map(),addresses={before:0x10030bd30,after:0x10030c104};
const tables=new Map(),states=new Map(),pending=new Map(),outputs=[],births=[],failures=[];
let checks=0,mismatches=0,context,blocks=0,changedOutputSamples=0,zeroControlTailBlocks=0;
const check=(name,p,a)=>{checks++;if(bits(p)!==bits(a)){mismatches++;if(failures.length<60)failures.push({name,predicted:p,actual:a,predictedBits:bits(p),actualBits:bits(a),context});}};
const integer=(name,p,a)=>{checks++;if(!Number.isInteger(a)||p!==a){mismatches++;if(failures.length<60)failures.push({name,predicted:p,actual:a,context});}};
function compareState(state,target){
 if(!target||target.slots.length!==state.slots.length)throw new Error('Complete pool state required');
 for(const [key,value] of Object.entries(state.controls))check('control:'+key,value,target.controls[key]);
 for(const key of ['elapsed','peak','floor','level'])check('state:'+key,state[key],target[key]);
 for(const key of ['head','active'])integer('state:'+key,state[key],target[key]);
 state.slots.forEach((slot,i)=>{
  if(!slot.valid)return; // Unwritten slots are not read by this computation.
  const actual=target.slots[i];if(actual.coefficients.length!==5)throw new Error('Incomplete coefficient target');
  slot.coefficients.forEach((v,j)=>check('slot:coefficient:'+j,v,fromBits(actual.coefficients[j])));
  check('slot:gain',slot.gain,fromBits(actual.gain));integer('slot:cursor',slot.cursor,actual.cursor);
  if(actual.history){if(actual.history.length!==4)throw new Error('Incomplete history target');slot.history.forEach((v,j)=>check('slot:history:'+j,v,fromBits(actual.history[j])));}
 });
}
for(const r of data.records){
 context={stage:r.stage,epoch:r.epoch,age:r.counter};
 if(!r.site||r.site.fileAddress!==addresses[r.stage]||!audited.has(`${r.thread}:${r.site.id}:${r.site.stopId}`))throw new Error('Audited fixed Rattle site required');
 if(!siteIds.has(r.stage)){if([...siteIds.values()].includes(r.site.id))throw new Error('Fixed site ID reused');siteIds.set(r.stage,r.site.id);}
 if(siteIds.get(r.stage)!==r.site.id)throw new Error('Fixed site identity changed');
 if(!Number.isInteger(r.epoch)||r.epoch<0||r.epoch>=5||!Number.isInteger(r.counter)||r.counter<0||r.counter%64)throw new Error('Invalid voice chronology');
 if(r.stage==='before'){
  if(pending.has(r.thread))throw new Error('Overlapping Rattle invocation');
  const table=r.sourceTable,key=table&&`${table.pointer}:${table.count}`;
  if(table?.values){if(tables.has(key)||table.values.length!==table.count)throw new Error('Invalid source table initialization');tables.set(key,Float32Array.from(table.values));}
  let own=states.get(r.epoch);
  if(!own){
   if(r.counter!==0||r.epoch!==states.size)throw new Error('First Rattle observation must be from age zero');
   for(const field of ['elapsed','peak','floor','level','head','active'])if(r.state[field]!==0)throw new Error('Unverified nonzero initial Rattle state');
   own={voice:r.voice,age:0,state:initializeRattleBurst(r.state.controls,table?Array.from(tables.get(key)??[]):[],r.state.slots.length)};states.set(r.epoch,own);
  }
  if(own.voice!==r.voice||own.age!==r.counter)throw new Error('Missing Rattle interval');
  if(table){
   const source=tables.get(key);if(!source||source.length!==table.count||own.tableKey&&own.tableKey!==key)throw new Error('Unverified source table transition');
   if(!own.tableKey){own.state.source=Float32Array.from(source);own.tableKey=key;}
  }
  check('cached-control',r.control,r.cachedControl);compareState(own.state,r.state);
  if(r.control===0&&own.state.active>0)zeroControlTailBlocks++;
  const result=renderRattleBurst(r.input,r.control,own.state);
  result.output.forEach((x,i)=>{if(bits(x)!==bits(r.input[i]))changedOutputSamples++;});
  for(const event of result.births)births.push({epoch:r.epoch,counter:r.counter,...event});
  pending.set(r.thread,{own,output:result.output,epoch:r.epoch,counter:r.counter});
 }else if(r.stage==='after'){
  const p=pending.get(r.thread);if(!p||p.epoch!==r.epoch||p.counter!==r.counter||p.own.voice!==r.voice||r.output.length!==64)throw new Error('Paired complete Rattle return required');
  p.output.forEach((v,i)=>check('output',v,r.output[i]));compareState(p.own.state,r.state);
  outputs.push({epoch:r.epoch,counter:r.counter,samples:Array.from(p.output)});p.own.age+=64;pending.delete(r.thread);blocks++;
 }else throw new Error('Unknown Rattle capture stage');
}
if(pending.size||states.size!==5||data.records.length!==blocks*2||!tables.size)throw new Error('Incomplete Rattle capture replay');
const report={observationResumes:resumes.length,passed:mismatches===0,checks,mismatches,blocks,outputSamples:blocks*64,changedOutputSamples,zeroControlTailBlocks,births,outputs,failures,sourceTableObserved:true,primaryInputObserved:true,initialDynamicStateComputed:true,statesCarried:true,coefficientsComputed:true,filterHistoryCarried:true,fullVoiceChainConnected:false,finalStereoAudioVerified:false};
fs.writeFileSync(reportPath,stringifyWithNegativeZero(report,2)+'\n');console.log(JSON.stringify({...report,births:births.length,outputs:undefined,failures:failures.slice(0,5)}));
if(!report.passed)process.exitCode=1;
