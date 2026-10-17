import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
const [capture,audit,directory,...extra]=process.argv.slice(2);
if(!capture||!audit||!directory||extra.length)throw new Error('Usage: capture.json resumes.jsonl new-directory');
const base=JSON.parse(fs.readFileSync(capture));fs.mkdirSync(directory);
const runner=fileURLToPath(new URL('./pianoteq_replay_active_time_envelope.mjs',import.meta.url));
const run=(input,output)=>spawnSync(process.execPath,[runner,input,audit,output,'--exp-candidate'],{encoding:'utf8',maxBuffer:2**20});
const baselinePath=path.join(directory,'baseline.json'),baselineRun=run(capture,baselinePath);if(baselineRun.status!==0)throw new Error('Active baseline must pass');
const baseline=JSON.parse(fs.readFileSync(baselinePath));
if(!baseline.passed||!baseline.timeChangedSamples||!baseline.primaryActiveBlocks||!baseline.postAttackBlocks)throw new Error('Actual shaping, primary envelope and post-attack coverage required');
const hash=r=>crypto.createHash('sha256').update(stringifyWithNegativeZero(r.predictions)).digest('hex'),expected=hash(baseline),first=(d,stage)=>d.records.find(r=>r.stage===stage);
const nextDouble=x=>{const v=new DataView(new ArrayBuffer(8));v.setFloat64(0,x);v.setBigUint64(0,v.getBigUint64(0)+1n);return v.getFloat64(0);};
const cases=[
 ['time-group-target',d=>{first(d,'time').channels[0][10]+=.125;},'one-same'],
 ['gains-auxiliary-target',d=>{first(d,'gains').auxiliary.values[0][10]+=.125;},'one-same'],
 ['time-counter-target',d=>{first(d,'time').tail.time.counter++;},'one-same'],
 ['model-selection-target',d=>{first(d,'model').selectedDuration+=.125;},'one-same'],
 ['initial-attack-samples-target',d=>{first(d,'before').tail.time.attack++;},'one-same'],
 ['double-rate-one-ulp-target',d=>{const t=first(d,'time').tail.time;t.attackRate=nextDouble(t.attackRate);},'one-same'],
 ['global-attack-source',d=>{first(d,'selection').source.globalAttack*=2;},'different'],
 ['audio-entry-source',d=>{first(d,'before').channels[0][10]+=.125;},'different'],
 ['unwritten-initial-value-source',d=>{first(d,'selection').initialTime.value=.5;},'two-same'],
 ['missing-model',d=>{d.records.splice(d.records.indexOf(first(d,'model')),1);},'reject'],
 ['wrong-site',d=>{first(d,'time').site.fileAddress+=4;},'reject'],
 ['unaudited-observation',d=>{first(d,'time').site.stopId+=1000000;},'reject'],
 ['incomplete-auxiliary',d=>{first(d,'gains').auxiliary.rows=2;},'reject'],
 ['no-post-attack-coverage',d=>{for(const r of d.records)if(r.stage==='selection')r.source.globalAttack=100;},'reject'],
];
const results=[];
for(const [name,mutate,expect]of cases){
 const d=structuredClone(base);mutate(d);const input=path.join(directory,'case.json'),out=path.join(directory,name+'.json');fs.writeFileSync(input,stringifyWithNegativeZero(d));
 const r=run(input,out),report=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)):undefined,predictionHash=report&&hash(report);
 const valid=expect==='reject'?r.status===1&&!report:r.status===1&&report?.mismatches===(expect==='one-same'?1:expect==='two-same'?2:report?.mismatches)&&report.mismatches>0&&(expect==='different'?predictionHash!==expected:predictionHash===expected);
 if(!valid)throw new Error('Unexpected active-time verdict '+name+': '+r.stderr.slice(-800));
 results.push({name,expect,exit:r.status,mismatches:report?.mismatches,predictionHash,error:r.stderr.slice(-600)});
 fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({baselineChecks:baseline.checks,results},null,2));
}
fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({allExpected:true,cases:results.length,baselineChecks:baseline.checks,predictionHash:expected,results},null,2));console.log(JSON.stringify({allExpected:true,cases:results.length}));
