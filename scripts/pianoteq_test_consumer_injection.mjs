import fs from 'node:fs';
import crypto from 'node:crypto';
import {verifyConsumerInjection} from './pianoteq_replay_consumer_injection.mjs';
const [capturePath,reportPath,resultPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||!resultPath||extra.length)throw new Error('Usage: capture.json parent-report.json new-results.json');
if(fs.existsSync(resultPath))throw new Error('Fresh test output path required');
const capture=JSON.parse(fs.readFileSync(capturePath));
const baseline=JSON.parse(fs.readFileSync(reportPath));
if(!capture.complete||!baseline.injection?.passed||!baseline.consumerInjection)throw new Error('Completed capture and independently checked injection component required');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const expectedHash=hash(baseline.injection.outputs),view=new DataView(new ArrayBuffer(4));
const bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite target');view.setFloat32(0,x);return view.getUint32(0);};
const entry=d=>d.records.find(r=>r.stage==='consumer'&&r.epoch===4).injectionPre;
const mixed=d=>d.records.find(r=>r.stage==='injectionMixed'&&r.epoch===4);
const seed=d=>d.records.find(r=>r.stage==='copy'&&r.epoch===4&&r.counter===0).releaseSeed;
const cases=[
 ['mixed-primary-target',d=>{mixed(d).primary[5]=.25;},'same'],
 ['pre-position-target-only',d=>{entry(d).state.position=.25;},'same'],
 ['mixed-oscillator-target',d=>{mixed(d).state.real=.25;},'same'],
 ['mixed-filter-history-target',d=>{mixed(d).filter.history[0]=.25;},'same'],
 ['seed-position-target',d=>{seed(d).state.position=.25;},'same'],
 ['global-amplitude-source',d=>{const v=new DataView(new ArrayBuffer(4));v.setFloat32(0,seed(d).global['0xfc4']);v.setUint32(0,v.getUint32(0)+1);seed(d).global['0xfc4']=v.getFloat32(0);},'different'],
 ['missing-pre-state',d=>{delete d.records.find(r=>r.stage==='consumer'&&r.epoch===4).injectionPre;},'reject'],
 ['missing-mixed',d=>{d.records.splice(d.records.indexOf(mixed(d)),1);},'reject'],
 ['nonzero-initial-history',d=>{seed(d).filter.history[0]=.25;},'same'],
 ['unsupported-curve-mode',d=>{seed(d).curveMode=1;},'reject'],
];
let baselineMismatches=0;
const verified=verifyConsumerInjection(capture,baseline.consumerOutputs,(_,a,b)=>{if(bits(a)!==bits(b))baselineMismatches++;});
if(baselineMismatches||hash(verified.outputs)!==expectedHash)throw new Error('Component baseline does not match capture');
const results=[]; // Component tests do not promote a failed parent chain to passed.

for(const [name,mutate,expect] of cases){
 const d=structuredClone(capture);mutate(d);let mismatches=0,result,error;
 try{result=verifyConsumerInjection(d,baseline.consumerOutputs,(_,a,b)=>{if(bits(a)!==bits(b))mismatches++;});}catch(e){error=e.message;}
 if(!error&&!mismatches)throw new Error('Perturbation was accepted: '+name);
 const outputHash=result&&hash(result.outputs);
 if(expect==='same'&&(mismatches!==1||outputHash!==expectedHash))throw new Error('Target perturbation changed own outputs or comparison count: '+name);
 if(expect==='different'&&(!outputHash||outputHash===expectedHash))throw new Error('Source did not change own outputs: '+name);
 if(expect==='reject'&&!error)throw new Error('Missing structural rejection: '+name);
 results.push({name,rejected:true,mismatches,error,outputHash});
}
fs.writeFileSync(resultPath,JSON.stringify({scope:'Release injection component only; parent verdict remains unchanged',parentChainPassed:baseline.passed,componentBaselinePassed:baseline.injection.passed,results},null,2),{flag:'wx'});console.log(JSON.stringify({parentChainPassed:baseline.passed,componentBaselinePassed:baseline.injection.passed,negativeCases:results.length,allRejected:results.every(r=>r.rejected)}));
