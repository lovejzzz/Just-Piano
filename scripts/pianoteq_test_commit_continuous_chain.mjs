import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [capturePath,directory,...extra]=process.argv.slice(2);
if(!capturePath||!directory||extra.length)throw new Error('Usage: completed-capture.json new-results-directory');
const base=JSON.parse(fs.readFileSync(capturePath));
if(!base.complete||!base.sourceCommits||!base.consumerPost)throw new Error('Completed joint capture required');
fs.mkdirSync(directory);
const runner=fileURLToPath(new URL('./pianoteq_replay_release_continuous_chain.mjs',import.meta.url));
const run=(input,output)=>spawnSync(process.execPath,[runner,input,output,'--pow-candidate'],{encoding:'utf8',maxBuffer:16*1024*1024});
const baselinePath=path.join(directory,'baseline.json'),baselineRun=run(capturePath,baselinePath);
if(baselineRun.error)throw baselineRun.error;
if(baselineRun.status!==0)throw new Error('Joint baseline failed: '+baselineRun.stderr.slice(-800));
const baseline=JSON.parse(fs.readFileSync(baselinePath));
if(!baseline.passed||!baseline.injection?.passed)throw new Error('Full parent and component must pass');
const hash=r=>crypto.createHash('sha256').update(JSON.stringify([r.continuousOutputs,r.consumerOutputs,r.injection.outputs])).digest('hex');
const expected=hash(baseline),first=(d,stage)=>d.records.find(r=>r.stage===stage);
const activePre=d=>{const seen=new Set();for(const r of d.records)if(r.stage==='consumer'&&!seen.has(r.epoch)){seen.add(r.epoch);if(r.injectionPre.envelope.active===1)return r;}throw new Error('Active initial envelope seed required by this fixture');};
const activePost=d=>{const pre=activePre(d);return d.records.find(r=>r.stage==='consumerPost'&&r.epoch===pre.epoch&&r.counter===pre.counter);};
const nextPre=d=>{const pre=activePre(d);return d.records.find(r=>r.stage==='consumer'&&r.epoch===pre.epoch&&r.counter>pre.counter);};
const cases=[
 ['late-root-snapshots',d=>{for(const r of d.records)if(r.stage==='coefficients')r.sourceX=r.sourceX===0?1:0;},'pass-same'],
 ['frozen-source-cache-target',d=>{first(d,'rattleSource').currentX=.125;},'one-same'],
 ['modal-commit-target',d=>{first(d,'rattleCommit').modalX=.125;},'one-same'],
 ['post-audio-target',d=>{first(d,'consumerPost').channels[0][8]=.25;},'one-same'],
 ['post-envelope-gain-target',d=>{activePost(d).envelope.gain=.25;},'one-same'],
 ['carried-pre-envelope-gain-target',d=>{nextPre(d).injectionPre.envelope.gain=.25;},'one-same'],
 ['carried-pre-envelope-step-target',d=>{nextPre(d).injectionPre.envelope.step=.75;},'one-same'],
 ['initial-envelope-gain-source',d=>{activePre(d).injectionPre.envelope.gain=.5;},'many-different'],
 ['missing-post-stage',d=>{d.records.splice(d.records.indexOf(first(d,'consumerPost')),1);},'reject'],
 ['invalid-slot-active-count',d=>{d.slotTransitions[0].active=7;},'reject'],
 ['wrong-source-owner',d=>{first(d,'rattleSource').owner='0x0';},'reject'],
 ['wrong-envelope-counter',d=>{activePost(d).envelope.elapsed-=1;},'reject'],
 ['wrong-source-dispatch-route',d=>{first(d,'rattleGate').route='invalid';},'reject'],
 ['skipped-modal-cache-target',d=>{first(d,'rattleSkip').modalX=.125;},'one-same'],
 ['missing-source-dispatch',d=>{d.records.splice(d.records.indexOf(first(d,'rattleGate')),1);},'reject'],
];
const results=[];
for(const [name,mutate,expect] of cases){
 const d=structuredClone(base);mutate(d);const input=path.join(directory,'case.json'),output=path.join(directory,name+'.json');fs.writeFileSync(input,JSON.stringify(d));
 const result=run(input,output);if(result.error)throw result.error;
 const report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):undefined,predictionHash=report&&hash(report);
 const valid=expect==='pass-same'?result.status===0&&report?.passed&&predictionHash===expected:expect==='one-same'?result.status===1&&report?.mismatches===1&&predictionHash===expected:expect==='many-different'?result.status===1&&report?.mismatches>1&&predictionHash!==expected:result.status===1&&!report;
 if(!valid)throw new Error(`Unexpected joint test verdict ${name}: ${result.stderr.slice(-800)}`);
 results.push({name,expect,exit:result.status,mismatches:report?.mismatches,predictionHash,error:result.stderr.slice(-600)});
}
fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({baselineChecks:baseline.checks,predictionHash:expected,cases:results.length,results},null,2),{flag:'wx'});
console.log(JSON.stringify({cases:results.length,allExpected:true}));
