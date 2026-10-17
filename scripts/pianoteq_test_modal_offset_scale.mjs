// Target-only and coverage checks against the preserved native initialization records.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [root,directory,...extra]=process.argv.slice(2);if(!directory||extra.length)throw new Error('Usage: analysis-root new-directory');fs.mkdirSync(directory);
const f=n=>path.join(root,n),read=n=>JSON.parse(fs.readFileSync(f(n))),runner=n=>fileURLToPath(new URL(n,import.meta.url));
const base=f('base-model-full-values-pass13.json'),source=f('debug-pass14-modal-source/runtime.json'),powA='debug-pass14-source-poles/powf-inputs.json',powB='debug-pass16-coupling-inputs-note70/powf-inputs.json';
const tracked=[powA,powB,'debug-pass16-coupling-inputs-v2/runtime.json'],hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before=tracked.map(n=>[n,hash(f(n))]);
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0).toString(16).padStart(8,'0');};
const coupling=(src,pow,capture,report)=>[runner('./pianoteq_replay_coupling_inputs.mjs'),base,src,pow,capture,report,'--source-controls-report',f('debug-pass17-tuning/source-controls-complete.json'),'--tuning-report',f('debug-pass17-tuning/tuning-replay.json')];
const poles=(pow,report)=>[runner('./pianoteq_replay_source_poles.mjs'),f('debug-pass14-source-poles/runtime.json'),source,f('debug-pass14-source-amplitude/runtime.json'),pow,report,'--impedance-report',f('pass123-impedance-report.json')];
const cases=[
 {name:'note70-powf-target',input:()=>{const d=read(powB),r=d.records[0];r.result=Math.fround(r.result*1.01);r.result_bits=bits(r.result);return d;},args:(input,report)=>coupling(f('debug-pass16-coupling-inputs-note70/runtime.json'),input,f('debug-pass16-coupling-inputs-note70/runtime.json'),report),check:r=>{assert.equal(r.powfMismatches,1);assert.equal(r.inputMismatches,0);assert.equal(r.failures.length,1);assert.deepEqual(r.checks,read('pass123-note70-coupling-report.json').checks);}},
 {name:'pole-powf-target',input:()=>{const d=read(powA),r=d.records[0];r.result=Math.fround(r.result+.125);r.result_bits=bits(r.result);return d;},args:poles,check:r=>{assert.equal(r.powfMismatches,1);assert.equal(r.frequencyMismatches+r.decayMismatches+r.lambdaMismatches+r.centerMismatches,0);assert.equal(r.failures.length,1);assert.deepEqual(r.checks,read('pass123-source-poles-report.json').checks);}},
 {name:'malformed-powf-target',input:()=>{const d=read(powA);d.records[0].result_bits='00000000';return d;},args:(input,report)=>coupling(source,input,f('debug-pass16-coupling-inputs-v2/runtime.json'),report),error:'Independent powf oracle does not match these inputs'},
 {name:'missing-modal-call',input:()=>{const d=read('debug-pass16-coupling-inputs-v2/runtime.json');d.records.pop();return d;},args:(input,report)=>coupling(source,f(powA),input,report),check:r=>{assert.equal(r.capturedCalls,35);assert.equal(r.expectedCalls,36);assert.equal(r.inputMismatches,0);assert.equal(r.failures.length,1);assert.equal(r.failures[0].stage,'missing-captured-call');}},
 {name:'duplicate-modal-call',input:()=>{const d=read('debug-pass16-coupling-inputs-v2/runtime.json');d.records.push(structuredClone(d.records[0]));return d;},args:(input,report)=>coupling(source,f(powA),input,report),error:'Duplicate modal-coordinate capture'}
];
const results=[];
for(const c of cases){const dir=path.join(directory,c.name);fs.mkdirSync(dir);const input=path.join(dir,'input.json'),report=path.join(dir,'report.json');fs.writeFileSync(input,JSON.stringify(c.input())+'\n',{flag:'wx'});const run=spawnSync(process.execPath,c.args(input,report),{encoding:'utf8',maxBuffer:4*1024*1024});fs.writeFileSync(path.join(dir,'process.json'),JSON.stringify({status:run.status,signal:run.signal,error:run.error?.message,stdout:run.stdout,stderr:run.stderr},null,2)+'\n');assert.equal(run.status,1);assert.equal(run.signal,null);let detail;if(c.error){assert((run.stderr??'').includes(c.error),run.stderr);assert(!fs.existsSync(report));detail={rejected:c.error};}else{const r=JSON.parse(fs.readFileSync(report));assert.equal(r.passed,false);assert.equal(r.nativeScalarPowfImplemented,true);assert.equal(r.powfOracleComparisonOnly,true);c.check(r);detail={powfMismatches:r.powfMismatches,failures:r.failures.length};}results.push({name:c.name,expectedFailureVerified:true,...detail});fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({results,sourceHashes:before},null,2)+'\n');console.log(JSON.stringify(results.at(-1)));}
for(const [n,digest]of before)assert.equal(hash(f(n)),digest);
