import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
const [capture,directory]=process.argv.slice(2);
if(!capture||!directory)throw new Error('Usage: complete-capture.json new-directory');
const base=JSON.parse(fs.readFileSync(capture));fs.mkdirSync(directory);
fs.copyFileSync(path.join(path.dirname(capture),'owned-resumes.jsonl'),path.join(directory,'owned-resumes.jsonl'));
const runner=fileURLToPath(new URL('./pianoteq_replay_group_envelope_control.mjs',import.meta.url));
const run=(input,output)=>spawnSync(process.execPath,[runner,input,output],{encoding:'utf8',maxBuffer:1024*1024});
const baselinePath=path.join(directory,'baseline.json');const b=run(capture,baselinePath);
if(b.status!==0)throw new Error(b.stderr);
const baseline=JSON.parse(fs.readFileSync(baselinePath));
const hash=r=>crypto.createHash('sha256').update(stringifyWithNegativeZero(r.outputs)).digest('hex'),expected=hash(baseline);
const active=(d,stage)=>d.records.find(r=>r.stage===stage&&r.state.active===1);
const first=d=>d.records.find(r=>r.stage==='apply');
const cases=[
 ['output-target',d=>{active(d,'applyAfter').channels[0][8]+=.125;},'one-same'],
 ['carried-gain-target',d=>{active(d,'apply').state.gain+=.125;},'one-same'],
 ['carried-step-target',d=>{active(d,'apply').state.step=.5;},'one-same'],
 ['control-return-step-target',d=>{d.records.find(r=>r.stage==='controlAfter').state.step=.5;},'one-same'],
 ['reactivation-gain-target',d=>{d.records.find(r=>r.stage==='control'&&r.state.gain<1).state.gain=.9;},'one-same'],
 ['post-elapsed-target',d=>{active(d,'applyAfter').state.elapsed++;},'one-same'],
 ['audio-source',d=>{active(d,'apply').channels[0][8]+=.125;},'different'],
 ['strength-source',d=>{d.records.find(r=>r.stage==='control').strength=.125;},'different'],
 ['rate-source',d=>{first(d).state.rate*=.5;},'different'],
 ['initial-gain-target',d=>{first(d).state.gain=.5;},'one-same'],
 ['missing-control-return',d=>{d.records.splice(d.records.findIndex(r=>r.stage==='controlAfter'),1);},'reject'],
 ['missing-apply-return',d=>{d.records.splice(d.records.findIndex(r=>r.stage==='applyAfter'),1);},'reject'],
 ['missing-birth',d=>{d.records.splice(d.records.findIndex(r=>r.stage==='birth'),1);},'reject'],
 ['unaudited-stop',d=>{first(d).site.stopId+=1000000;},'reject'],
 ['wrong-site',d=>{first(d).site.fileAddress+=4;},'reject'],
 ['invalid-duration',d=>{first(d).state.duration=0;},'reject'],
];
const results=[];
for(const [name,mutate,expect] of cases){
 const d=structuredClone(base);mutate(d);const input=path.join(directory,'case.json'),output=path.join(directory,name+'.json');fs.writeFileSync(input,stringifyWithNegativeZero(d));
 const r=run(input,output);if(r.error)throw r.error;
 const report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):undefined;
 const same=report&&hash(report)===expected;
 const valid=expect==='one-same'?r.status===1&&report?.mismatches===1&&same:expect==='different'?r.status===1&&report?.mismatches>0&&!same:r.status===1&&!report;
 results.push({name,expect,valid,mismatches:report?.mismatches,error:r.stderr.slice(-500)});
 if(!valid)throw new Error('Unexpected case '+name+': '+JSON.stringify(results.at(-1)));
}
fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({baselineChecks:baseline.checks,cases:results.length,allExpected:true,results},null,2));
console.log(JSON.stringify({cases:results.length,allExpected:true}));
