// Adversarial checks against authentic full captures; preserve the rejected-run classification.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readCapture,writeCapture} from './pianoteq_capture_jsonl.mjs';
const [capture,audit,archive,observed,reference,out]=process.argv.slice(2);
if(!out)throw new Error('Usage: capture.jsonl owned-resumes.jsonl archive.json native.wav reference.wav new-output-dir');
fs.mkdirSync(out);const data=await readCapture(capture),sourceDir=path.dirname(capture),results=[];
const script=fileURLToPath(new URL('./pianoteq_replay_fixed_shared_stereo.mjs',import.meta.url));
const files=['commands.lldb','inspected-diagnostic-resumes.jsonl',...fs.readdirSync(sourceDir).filter(n=>n.startsWith('driver-failure-'))];
const mutate=(object,key,value)=>{const previous=object[key];object[key]=value;return()=>{object[key]=previous;};};
const key=data.records.find(r=>r.stage==='key'),sleep=data.records.find(r=>r.stage==='key'&&r.spatial.sleep.inputCounters.some(x=>x>0));
const pcm=data.records.find(r=>r.stage==='pcm'&&r.output.values[0].some(x=>x!==0)),input=data.records.find(r=>r.stage==='before'&&r.epoch===0&&r.counter===64);
assert(key&&sleep&&pcm&&input,'Authentic active and quiet-state targets required');
const cases=[
 {name:'retained-driver-failure',diagnostic:false,error:'Inspected driver failures cannot become clean full-capture proof'},
 {name:'key-target',change:()=>mutate(key.groups[0].values[0],0,Math.fround(key.groups[0].values[0][0]+.001)),check:r=>{assert.equal(r.mismatches,1);assert.equal(r.failures[0].name,'voice-spatial-output');assert.equal(r.pcmDifferences,0);assert.equal(r.pcmCalibrationDifferences,0);}},
 {name:'sleep-target',change:()=>{const i=sleep.spatial.sleep.inputCounters.findIndex(x=>x>0);return mutate(sleep.spatial.sleep.inputCounters,i,sleep.spatial.sleep.inputCounters[i]+1);},check:r=>{assert.equal(r.mismatches,1);assert.equal(r.failures[0].name,'sleep-input');assert.equal(r.pcmDifferences,0);}},
 {name:'pcm-target',change:()=>{const i=pcm.output.values[0].findIndex(x=>x!==0);return mutate(pcm.output.values[0],i,Math.fround(pcm.output.values[0][i]+.001));},check:r=>{assert.equal(r.mismatches,1);assert.equal(r.failures[0].name,'final-stereo');assert.equal(r.pcmDifferences,0);assert.equal(r.pcmCalibrationDifferences,1);}},
 {name:'voice-input',change:()=>mutate(input.channels[0],0,Math.fround(input.channels[0][0]+.001)),check:r=>{assert(r.mismatches>1);assert(r.pcmDifferences>0);assert.equal(r.pcmCalibrationDifferences,0);}},
 {name:'global-order',change:()=>mutate(data.records.find(r=>r.stage==='global'),'globalBlock',1),error:'Contiguous supported global frame required'},
 {name:'missing-final-pcm',change:()=>{const i=data.records.findLastIndex(r=>r.stage==='pcm'),r=data.records.splice(i,1)[0];return()=>data.records.splice(i,0,r);},error:'Full native voice/global coverage required'},
 {name:'unaudited-observation',editAudit:(dir)=>{const t=data.records.find(r=>r.stage==='global'),rows=fs.readFileSync(audit,'utf8').trim().split('\n').map(s=>JSON.parse(s));const filtered=rows.filter(a=>!a.threads.some(v=>v.lastOwned?.id===t.site.id&&v.lastOwned?.stopId===t.site.stopId&&v.thread===t.thread));assert(filtered.length<rows.length);fs.writeFileSync(path.join(dir,'owned-resumes.jsonl'),filtered.map(r=>JSON.stringify(r)).join('\n')+'\n');},error:'Unaudited fixed-site record'}
];
for(const c of cases){
 const dir=path.join(out,c.name);fs.mkdirSync(dir);for(const name of files)fs.copyFileSync(path.join(sourceDir,name),path.join(dir,name));fs.copyFileSync(audit,path.join(dir,'owned-resumes.jsonl'));if(c.editAudit)c.editAudit(dir);
 const restore=c.change?.();try{writeCapture(path.join(dir,'runtime.jsonl'),data);}finally{restore?.();}
 const report=path.join(dir,'report.json'),args=['--max-old-space-size=8192',script,path.join(dir,'runtime.jsonl'),path.join(dir,'owned-resumes.jsonl'),report,'--exp-candidate',`--archive-time-source=${archive}`,`--observed-wav=${observed}`,`--reference-wav=${reference}`];if(c.diagnostic!==false)args.push('--diagnostic-rejected-capture');
 const run=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:4*1024*1024});fs.writeFileSync(path.join(dir,'process.json'),JSON.stringify({status:run.status,signal:run.signal,error:run.error?.message,stdout:run.stdout,stderr:run.stderr},null,2)+'\n');
 assert.equal(run.signal,null);assert.equal(run.status,1);
 let detail;if(c.error){assert((run.stderr??'').includes(c.error),run.stderr);assert(!fs.existsSync(report));detail={rejected:c.error};}else{const r=JSON.parse(fs.readFileSync(report));assert.equal(r.passed,false);assert.equal(r.sameRunPassed,false);assert.equal(r.captureAccepted,false);assert.equal(r.finalStereoAudioVerified,false);assert.equal(r.fullPcmFrames,128512);c.check(r);detail={mismatches:r.mismatches,pcmDifferences:r.pcmDifferences,pcmCalibrationDifferences:r.pcmCalibrationDifferences};}
 results.push({name:c.name,expectedFailureVerified:true,...detail});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.at(-1)));
}
