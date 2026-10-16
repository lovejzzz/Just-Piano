// Bind packed initialization rows to the actual runtime key cells, then reuse
// pass70's unchanged arithmetic verifier with computed copy results as inputs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
const fields=['baseTime','maximumTime','amplitudeScale'];
const table=data.runtimeKeyTable,rows=data.copyRows;
if(data.modelRows?.length!==0||!table||table.keys.length!==105||rows?.length!==210)throw new Error('Verified cached 105-key, two-copy profile required');
const addr=s=>{if(typeof s!=='string'||!/^0x[0-9a-f]+$/.test(s))throw new Error('Invalid target address');return BigInt(s);};
const view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite control');view.setFloat32(0,x);return view.getUint32(0);};
let checked=0,mismatches=0;const failures=[];
function controls(name,p,a){for(const field of fields){checked++;if(bits(p[field])!==bits(a[field])){mismatches++;if(failures.length<30)failures.push({name,field,predicted:p[field],actual:a[field]});}}}
let cursor=0;
for(let i=0;i<rows.length;i++){
 const row=rows[i],index=i%105,group=Math.floor(i/105),first=rows[group*105];
 if(row.ordinal!==i||row.index!==index||row.storedIndex!==index+9||row.modelRowsAvailable!==0||row.runtimeOwner!==first.runtimeOwner||row.packedOwner!==first.packedOwner||addr(row.packedOwner)!==addr(table.manager)+0xc60n||addr(row.source)!==addr(first.source)+BigInt(index)*0x38n||addr(row.destination)!==addr(first.destination)+BigInt(index)*0x140n)throw new Error('Packed/runtime initialization identity differs');
 for(const [next,site] of [['copyResult','runtimeCopyResult'],['copy','runtimeCopy']]){
  const t=data.transitions[cursor++],enabled=['initial','modelBaseTime','modelGlobal',site].sort();
  if(!t||t.phase!=='init'||t.next!==next||t.activeSites!==4||t.modelRows!==0||t.copyRows!==i+1||JSON.stringify([...t.enabled].sort())!==JSON.stringify(enabled))throw new Error('Invalid initialization hardware phase');
 }
 controls('copy:'+i,row.sourceControls,row.targetControls);
 if(group)controls('repeat:'+index,rows[index].sourceControls,row.sourceControls);
}
if(rows[0].source!==rows[105].source||rows[0].runtimeOwner===rows[105].runtimeOwner||rows[0].destination===rows[105].destination)throw new Error('Distinct runtime copies required');
const actual=new Map();
for(let i=0;i<105;i++){
 const key=table.keys[i];if(addr(key.object)!==addr(table.begin)+BigInt(i)*0x140n)throw new Error('Runtime key table not contiguous');
 const matches=rows.filter(row=>row.destination===key.object);
 if(matches.length!==1||matches[0].index!==i)throw new Error('Runtime key requires unique actual destination binding');
 const computed=Object.fromEntries(fields.map(field=>[field,Math.fround(matches[0].sourceControls[field])]));
 controls('runtime:'+i,computed,key.controls);actual.set(key.object,computed);
}
for(const event of data.eventRecords){
 if(event.stage!=='noteOff')continue;
 if(addr(event.object)!==addr(table.begin)+BigInt(event.key)*0x140n||!actual.has(event.object))throw new Error('Note-off key not bound to initialized destination');
 controls('event:'+event.key,actual.get(event.object),event.controls);
 event.controls={...actual.get(event.object)};
}
const initial=data.transitions[cursor++];
if(initial?.ordinal!==0||initial.activeSites!==4||JSON.stringify(initial.disable)!==JSON.stringify(['initial','modelBaseTime','modelGlobal','modelBaseFlag','runtimeCopy','runtimeCopyResult'])||JSON.stringify(initial.enable)!==JSON.stringify(['key','raw','body','bodyResult']))throw new Error('Invalid initialization-to-audio hardware phase');
// Only the validated initialization prefix is adapted. The complete event and
// audio phase suffix is checked by the original strict pass70 verifier.
data.transitions=[{ordinal:0,disable:'initial',enable:['key','raw'],activeSites:4},...data.transitions.slice(cursor)];
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'piano-key-copy-'));
try{
 const normalized=path.join(temporary,'capture.json'),childReport=path.join(temporary,'report.json');
 fs.writeFileSync(normalized,JSON.stringify(data));
 const run=spawnSync(process.execPath,[fileURLToPath(new URL('./pianoteq_replay_noteoff_global_chain.mjs',import.meta.url)),normalized,childReport],{encoding:'utf8',maxBuffer:1024*1024});
 if(!fs.existsSync(childReport))throw new Error(run.stderr||'Downstream strict verifier failed');
 const downstream=JSON.parse(fs.readFileSync(childReport,'utf8'));
 const report={...downstream,passed:run.status===0&&downstream.passed&&mismatches===0,count:downstream.count+checked,matched:downstream.matched+checked-mismatches,mismatches:downstream.mismatches+mismatches,floatCount:downstream.floatCount+checked,
  packedControlChecks:checked,packedRows:210,actualRuntimeKeys:105,hardwareTransitions:cursor+data.transitions.length-1,modelConstructorRows:0,
  packedSourceControlsObserved:true,runtimeCopyComputed:true,runtimeControlsAndEventControlsComparisonOnly:true,noteOffTimeControlsAndVoiceAmplitudeObserved:false,voiceAmplitudeObserved:true,
  modelCurveGenerationNotComputed:true,completeVoiceOrBrowserEquivalence:false,failures:[...failures,...downstream.failures]};
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
