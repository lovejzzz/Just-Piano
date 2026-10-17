import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
const [capturePath,directory,...extra]=process.argv.slice(2);
if(!capturePath||!directory||extra.length)throw new Error('Usage: completed-capture.json new-results-directory');
const base=JSON.parse(fs.readFileSync(capturePath));
if(!base.complete||!base.sourceCommits||!base.consumerPost)throw new Error('Completed joint capture required');
fs.mkdirSync(directory);
const runner=fileURLToPath(new URL('./pianoteq_replay_release_continuous_chain.mjs',import.meta.url));
const auditOptions=base.consumerCross?['--resume-audit='+path.join(path.dirname(path.resolve(capturePath)),'owned-resumes.jsonl')]:[];
const run=(input,output)=>spawnSync(process.execPath,[runner,input,output,'--pow-candidate',...auditOptions],{encoding:'utf8',maxBuffer:16*1024*1024});
const baselinePath=path.join(directory,'baseline.json'),baselineRun=run(capturePath,baselinePath);
if(baselineRun.error)throw baselineRun.error;
if(baselineRun.status!==0)throw new Error('Joint baseline failed: '+baselineRun.stderr.slice(-800));
const baseline=JSON.parse(fs.readFileSync(baselinePath));
if(!baseline.passed||!baseline.injection?.passed||base.consumerCross&&!baseline.cross?.passed)throw new Error('Full parent and components must pass');
const hash=r=>crypto.createHash('sha256').update(stringifyWithNegativeZero([r.continuousOutputs,r.consumerOutputs,r.injection.outputs,r.cross?.outputs])).digest('hex');
const expected=hash(baseline),first=(d,stage)=>d.records.find(r=>r.stage===stage);
const activePre=d=>{const seen=new Set();for(const r of d.records)if(r.stage==='consumer'&&(d.earlyConsumer||!seen.has(r.epoch))){seen.add(r.epoch);if(r.injectionPre.envelope.active===1)return r;}throw new Error('Active envelope required by this fixture');};
const activePost=d=>{const pre=activePre(d);return d.records.find(r=>r.stage==='consumerPost'&&r.epoch===pre.epoch&&r.counter===pre.counter);};
const nextPre=d=>{const pre=activePre(d);return d.records.find(r=>r.stage==='consumer'&&r.epoch===pre.epoch&&r.counter>pre.counter);};
const bypassPre=d=>{const r=d.records.find(r=>r.stage==='consumer'&&(r.injectionPre.controls.skip&1)&&r.injectionPre.envelope.active===0&&r.injectionPre.envelope.gain!==1);if(!r)throw new Error('Non-unit bypassed envelope fixture required');return r;};
const cases=[
 ['late-root-snapshots',d=>{for(const r of d.records)if(r.stage==='coefficients')r.sourceX=r.sourceX===0?1:0;},'pass-same'],
 ['frozen-source-cache-target',d=>{first(d,'rattleSource').currentX=.125;},'one-same'],
 ['modal-commit-target',d=>{first(d,'rattleCommit').modalX=.125;},'one-same'],
 ['post-audio-target',d=>{first(d,'consumerPost').channels[0][8]=.25;},'one-same'],
 ['post-envelope-gain-target',d=>{activePost(d).envelope.gain=.25;},'one-same'],
 ['carried-pre-envelope-gain-target',d=>{nextPre(d).injectionPre.envelope.gain=.25;},'one-same'],
 ['carried-pre-envelope-step-target',d=>{nextPre(d).injectionPre.envelope.step=.75;},'one-same'],
 [base.earlyConsumer?'initial-envelope-gain-target':'initial-envelope-gain-source',d=>{(d.earlyConsumer?first(d,'consumer'):activePre(d)).injectionPre.envelope.gain=.5;},base.earlyConsumer?'one-same':'many-different'],
 ['missing-post-stage',d=>{d.records.splice(d.records.indexOf(first(d,'consumerPost')),1);},'reject'],
 ['invalid-slot-active-count',d=>{d.slotTransitions[0].active=7;},'reject'],
 ['wrong-source-owner',d=>{first(d,'rattleSource').owner='0x0';},'reject'],
 ['wrong-envelope-counter',d=>{activePost(d).envelope.elapsed-=1;},'reject'],
 ['wrong-source-dispatch-route',d=>{first(d,'rattleGate').route='invalid';},'reject'],
 ['skipped-modal-cache-target',d=>{first(d,'rattleSkip').modalX=.125;},'one-same'],
 ['missing-source-dispatch',d=>{d.records.splice(d.records.indexOf(first(d,'rattleGate')),1);},'reject'],
 ['bypassed-envelope-dispatch-source',d=>{bypassPre(d).injectionPre.controls.skip=0;},'many-different'],
];
if(base.earlyConsumer)cases.push(
 ['group-control-pre-gain-target',d=>{first(d,'groupControl').state.gain=.25;},'one-same'],
 ['group-control-return-step-target',d=>{first(d,'groupControlAfter').state.step=.5;},'one-same'],
 ['group-control-strength-target',d=>{first(d,'groupControl').strength=.125;},'one-same'],
 ['normalized-strike-velocity-source',d=>{first(d,'before').inputs.newVelocity=.95;},'many-different'],
 ['group-model-rate-source',d=>{first(d,'consumer').injectionPre.envelope.rate*=.5;},'many-different'],
 ['missing-group-control-return',d=>{d.records.splice(d.records.indexOf(first(d,'groupControlAfter')),1);},'reject'],
 ['missing-group-control',d=>{d.records.splice(d.records.indexOf(first(d,'groupControl')),1);},'reject'],
 ['wrong-control-slot-count',d=>{d.slotTransitions.find(t=>t.newRole==='groupControl').registered=7;},'reject'],
 ['deferred-update-wrong-callback',d=>{d.slotTransitions[0].callbackStopId+=1000000;},'reject'],
 ['deferred-update-before-stop',d=>{d.slotTransitions[0].afterRecord=0;},'reject'],
 ['unproven-stopped-frame',d=>{const r=first(d,'coefficients');r.site.delivery='stopped-frame';r.site.reason=3;},'reject'],
);
if(base.stoppedWorkerReads?.length)cases.push(
 ['wrong-stopped-frame-counter',d=>{d.stoppedWorkerReads[0].counter++;},'reject'],
 ['missing-stopped-frame-delivery',d=>{delete d.records[d.stoppedWorkerReads[0].record-1].site.delivery;},'reject'],
);
if(base.consumerCross){
 const auxiliaryKept=!!(first(base,'consumerPost').crossControls.keepAuxiliary&1);
 cases.push(
  ['cross-audio-target',d=>{first(d,'consumerCross').channels[0][8]=.25;},'one-same'],
  ['cross-auxiliary-target',d=>{first(d,'consumerCross').auxiliary.values[0][8]=.25;},'one-same'],
  ['cross-auxiliary-source',d=>{first(d,'consumerPost').auxiliary.values[0][8]=.25;},auxiliaryKept?'one-different':'pass-same'],
  ['cross-clear-control-source',d=>{const r=d.records.find(r=>r.stage==='consumerPost'&&(r.crossControls.keepGroups&1)&&r.channels.some(g=>g.some(x=>x!==0)));if(!r)throw new Error('Nonzero kept cross group required');r.crossControls.keepGroups&=254;},'many-different'],
  ['cross-active-processor',d=>{first(d,'consumerPost').crossControls.processorA=1;},'reject'],
  ['missing-cross-stage',d=>{d.records.splice(d.records.indexOf(first(d,'consumerCross')),1);},'reject'],
  ['unaudited-cross-observation',d=>{first(d,'consumerCross').site.stopId+=1000000;},'reject'],
 );
}
const results=[];
for(const [name,mutate,expect] of cases){
 const d=structuredClone(base);mutate(d);const input=path.join(directory,'case.json'),output=path.join(directory,name+'.json');fs.writeFileSync(input,stringifyWithNegativeZero(d));
 const result=run(input,output);if(result.error)throw result.error;
 const report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):undefined,predictionHash=report&&hash(report);
 const valid=expect==='pass-same'?result.status===0&&report?.passed&&predictionHash===expected:expect==='one-same'?result.status===1&&report?.mismatches===1&&predictionHash===expected:expect==='one-different'?result.status===1&&report?.mismatches===1&&predictionHash!==expected:expect==='many-different'?result.status===1&&report?.mismatches>1&&predictionHash!==expected:result.status===1&&!report;
 if(!valid)throw new Error(`Unexpected joint test verdict ${name}: ${result.stderr.slice(-800)}`);
 results.push({name,expect,exit:result.status,mismatches:report?.mismatches,predictionHash,error:result.stderr.slice(-600)});
}
fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({baselineChecks:baseline.checks,predictionHash:expected,cases:results.length,results},null,2),{flag:'wx'});
console.log(JSON.stringify({cases:results.length,allExpected:true}));
