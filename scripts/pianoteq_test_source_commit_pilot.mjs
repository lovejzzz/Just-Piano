import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const [capturePath,directory,...extra]=process.argv.slice(2);
if(!capturePath||!directory||extra.length)throw new Error('Usage: capture.json new-results-directory');
const base=JSON.parse(fs.readFileSync(capturePath));
if(!base.windowComplete||base.completion!=='native-exit')throw new Error('Completed five-voice capture required');
fs.mkdirSync(directory);const runner=fileURLToPath(new URL('./pianoteq_replay_source_commit_pilot.mjs',import.meta.url));
const first=(d,stage)=>d.records.find(r=>r.stage===stage),setter=d=>d.records.find(r=>r.stage==='setter'&&r.caller==='0x100460260');
const cases=[
 ['baseline',()=>{},'pass'],
 ['source-cache-target',d=>{first(d,'source').currentX=.125;},'one'],
 ['setter-input-target',d=>{setter(d).argument=.125;},'one'],
 ['modal-store-target',d=>{setter(d).modalX=.125;},'one'],
 ['worker-modal-target',d=>{first(d,'worker').modalX=.125;},'one'],
 ['copy-cache-target',d=>{first(d,'copy').voiceX=.125;},'one'],
 ['frozen-source-input',d=>{first(d,'source').frozenX=.875;},'many'],
 ['late-root-is-not-input',d=>{first(d,'source').sourceMemoryX=.875;},'pass'],
 ['missing-transition',d=>{d.transitions.shift();},'reject'],
 ['wrong-active-count',d=>{d.transitions[0].active=5;},'reject'],
 ['wrong-retired-point',d=>{d.transitions[0].oldId=-1;},'reject'],
 ['unknown-caller',d=>{setter(d).caller='0xdeadbeef';},'reject'],
 ['wrong-voice-epoch',d=>{first(d,'source').epoch=4;},'reject'],
 ['missing-worker-age',d=>{first(d,'worker').workerAge+=64;},'reject'],
 ['incomplete',d=>{d.windowComplete=false;},'reject'],
 ['missing-runtime-commit',d=>{d.records.splice(d.records.indexOf(setter(d)),1);},'reject'],
 ['wrong-source-owner',d=>{first(d,'source').owner='0x0';},'reject'],
 ['wrong-source-thread',d=>{first(d,'source').thread+=1;},'reject'],
 ['outside-control-range',d=>{first(d,'source').frozenX=1.5;},'reject'],
 ['unbound-setter-voice',d=>{setter(d).voice='0x0';},'reject'],
];
const results=[];
for(const [name,mutate,expect] of cases){
 const d=structuredClone(base);mutate(d);const fixture=path.join(directory,'case.json'),output=path.join(directory,name+'.json');fs.writeFileSync(fixture,JSON.stringify(d));
 const run=spawnSync(process.execPath,[runner,fixture,output],{encoding:'utf8'});if(run.error)throw run.error;
 const report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):undefined;
 const valid=expect==='pass'?run.status===0&&report?.passed:expect==='one'?run.status===1&&report?.mismatches===1:expect==='many'?run.status===1&&report?.mismatches>1:run.status===1&&!report;
 if(!valid)throw new Error(`Incorrect perturbation verdict: ${name}: ${run.stderr}`);
 results.push({name,expect,exit:run.status,mismatches:report?.mismatches,error:run.stderr.slice(-600)});
}
fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({scope:'Source/parameter commits only, not audio equivalence',cases:results.length,results},null,2),{flag:'wx'});
console.log(JSON.stringify({cases:results.length,expectedRejections:results.filter(r=>r.expect!=='pass').length,expectedAcceptances:results.filter(r=>r.expect==='pass').length,allExpected:true}));
