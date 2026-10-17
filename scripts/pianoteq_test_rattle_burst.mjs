import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
const [capturePath,directory,...extra]=process.argv.slice(2);
if(!capturePath||!directory||extra.length)throw new Error('Usage: complete-capture.json new-directory');
const base=JSON.parse(fs.readFileSync(capturePath));if(!base.complete)throw new Error('Complete capture required');
fs.mkdirSync(directory);
const runner=fileURLToPath(new URL('./pianoteq_replay_rattle_burst.mjs',import.meta.url));
const audit=path.join(path.dirname(path.resolve(capturePath)),'owned-resumes.jsonl');
const run=(input,output)=>spawnSync(process.execPath,[runner,input,output,'--resume-audit='+audit],{encoding:'utf8',maxBuffer:1024*1024});
const baselinePath=path.join(directory,'baseline.json'),baselineRun=run(capturePath,baselinePath);
if(baselineRun.error)throw baselineRun.error;
if(baselineRun.status!==0)throw new Error('Rattle baseline failed: '+baselineRun.stderr);
const baseline=JSON.parse(fs.readFileSync(baselinePath));if(!baseline.passed||!baseline.births.length)throw new Error('Active Rattle baseline required');
const hash=r=>crypto.createHash('sha256').update(stringifyWithNegativeZero(r.outputs)).digest('hex'),expected=hash(baseline);
const first=d=>d.records.find(r=>r.stage==='before');
const active=(d,stage)=>d.records.find(r=>r.stage===stage&&r.state.active>0);
const slot=r=>r.state.slots[r.state.head];
const trigger=d=>d.records.find(r=>r.stage==='before'&&r.epoch===baseline.births[0].epoch&&r.counter===baseline.births[0].counter);
const cases=[
 ['output-target',d=>{d.records.find(r=>r.stage==='after').output[8]=.125;},'one-same'],
 ['post-gain-target',d=>{slot(active(d,'after')).gain++;},'one-same'],
 ['carried-pre-gain-target',d=>{slot(active(d,'before')).gain++;},'one-same'],
 ['post-history-target',d=>{slot(active(d,'after')).history[0]++;},'one-same'],
 ['carried-pre-history-target',d=>{slot(active(d,'before')).history[0]++;},'one-same'],
 ['post-coefficient-target',d=>{slot(active(d,'after')).coefficients[0]++;},'one-same'],
 ['cached-control-target',d=>{first(d).cachedControl=.125;},'one-same'],
 ['post-clock-target',d=>{d.records.find(r=>r.stage==='after').state.elapsed=.25;},'one-same'],
 ['unwritten-coefficient-irrelevant',d=>{first(d).state.slots[0].coefficients[0]=0x7fc00000;},'pass-same'],
 ['frozen-control-source',d=>{trigger(d).control=.5;},'many-different'],
 ['shared-table-source',d=>{d.records.find(r=>r.sourceTable?.values).sourceTable.values[8]+=.125;},'many-different'],
 ['initial-scale-source',d=>{first(d).state.controls.scale*=.5;},'many-different'],
 ['initial-decay-source',d=>{first(d).state.controls.decay=.5;},'many-different'],
 ['missing-return',d=>{d.records.splice(d.records.findIndex(r=>r.stage==='after'),1);},'reject'],
 ['nonzero-initial-state',d=>{first(d).state.elapsed=.25;},'reject'],
 ['unknown-table-transition',d=>{d.records.find(r=>r.sourceTable&&!r.sourceTable.values).sourceTable.pointer='0x0';},'reject'],
 ['unaudited-stop',d=>{first(d).site.stopId+=1000000;},'reject'],
 ['wrong-fixed-site',d=>{first(d).site.fileAddress+=4;},'reject'],
];
const results=[];
for(const [name,mutate,expect] of cases){
 const d=structuredClone(base);mutate(d);const input=path.join(directory,'case.json'),output=path.join(directory,name+'.json');fs.writeFileSync(input,stringifyWithNegativeZero(d));
 const result=run(input,output);if(result.error)throw result.error;
 const report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):undefined,predictionHash=report&&hash(report);
 const valid=expect==='pass-same'?result.status===0&&report?.passed&&predictionHash===expected:expect==='one-same'?result.status===1&&report?.mismatches===1&&predictionHash===expected:expect==='many-different'?result.status===1&&report?.mismatches>1&&predictionHash!==expected:result.status===1&&!report;
 if(!valid)throw new Error(`Unexpected Rattle case ${name}: ${result.stderr.slice(-800)}`);
 results.push({name,expect,exit:result.status,mismatches:report?.mismatches,predictionHash,error:result.stderr.slice(-500)});
}
fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({baselineChecks:baseline.checks,outputSamples:baseline.outputSamples,births:baseline.births.length,cases:results.length,results},null,2),{flag:'wx'});
console.log(JSON.stringify({cases:results.length,allExpected:true}));
