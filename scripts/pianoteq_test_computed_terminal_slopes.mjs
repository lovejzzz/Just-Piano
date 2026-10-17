// Authentic tail replay with same-run computed Rattle outputs and producer models.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {verifyVoiceTailEnvelopes} from './pianoteq_replay_voice_tail_envelopes.mjs';
const [capture,baselinePath,directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw new Error('Usage: complete-capture.json computed-chain-report.json new-directory');
fs.mkdirSync(directory);const bytes=fs.readFileSync(capture),captureHash=crypto.createHash('sha256').update(bytes).digest('hex');
const data=JSON.parse(bytes),baseline=JSON.parse(fs.readFileSync(baselinePath));
assert(data.complete&&baseline.passed&&baseline.computedTerminalSlopes&&baseline.tailEnvelopes.terminalSlopesComputed);
assert.equal(baseline.terminalSlopeModels.length,5);assert.equal(baseline.rattleAudio.blocks,3314);
const bits=new DataView(new ArrayBuffer(4)),word=x=>{assert(Number.isFinite(x));bits.setFloat32(0,x);return bits.getUint32(0);};
function signature(outputs){const h=crypto.createHash('sha256'),header=Buffer.alloc(8),row=Buffer.alloc(256);for(const r of outputs){header.writeUInt32LE(r.epoch,0);header.writeUInt32LE(r.counter,4);h.update(header);for(const values of [...r.channels,...r.auxiliary]){assert.equal(values.length,64);values.forEach((x,i)=>row.writeFloatLE(x,i*4));h.update(row);}}return h.digest('hex');}
function run(models){let checks=0,mismatches=0;const names={};const check=(name,p,a)=>{checks++;if(word(p)!==word(a)){mismatches++;names[name]=(names[name]??0)+1;}};const checkDouble=(name,p,a)=>{checks++;assert(Number.isFinite(p)&&Number.isFinite(a));if(!Object.is(p,a)){mismatches++;names[name]=(names[name]??0)+1;}};const result=verifyVoiceTailEnvelopes(data,baseline.rattleAudio,check,checkDouble,()=>{},models);assert(result.terminalSlopesComputed);return {checks,mismatches,names,blocks:result.blocks,signature:signature(result.outputs),primaryActiveBlocks:result.primaryActiveBlocks};}
const models=()=>new Map(structuredClone(baseline.terminalSlopeModels).map(m=>[m.epoch,m]));
const firstIndex=data.records.findIndex(r=>r.stage==='audioReturn'&&r.epoch===0&&r.counter===0),first=data.records[firstIndex];assert(firstIndex>0);
const control=run(models());assert.equal(control.mismatches,0);assert.equal(control.signature,signature(baseline.tailEnvelopes.outputs));
const results=[];fs.writeFileSync(path.join(directory,'baseline.json'),JSON.stringify(control,null,2)+'\n');
const cases=[
 {name:'primary-slope-target',change:()=>{const previous=first.tail.primary.slope;first.tail.primary.slope=2;return()=>{first.tail.primary.slope=previous;};},expect:r=>{assert.equal(r.mismatches,1);assert.equal(r.names['tail:primary:slope'],1);assert.equal(r.signature,control.signature);}},
 {name:'secondary-slope-target',change:()=>{const previous=first.tail.secondary.slope;first.tail.secondary.slope=.5;return()=>{first.tail.secondary.slope=previous;};},expect:r=>{assert.equal(r.mismatches,1);assert.equal(r.names['tail:secondary:slope'],1);assert.equal(r.signature,control.signature);}},
 {name:'computed-primary-model',change:m=>{m.get(0).slopes.primary=2;},expect:r=>{assert(r.mismatches>1);assert.notEqual(r.signature,control.signature);assert(r.primaryActiveBlocks>0);}},
 {name:'future-source',change:m=>{m.get(0).sourceRecordIndex=firstIndex;},error:/must precede/},
 {name:'wrong-source-record',change:m=>{m.get(0).sourceRecordIndex=0;},error:/must precede/},
 {name:'wrong-source-voice',change:m=>{m.get(0).voice='0x1234';},error:/must precede/},
 {name:'missing-model',change:m=>{m.delete(4);},error:/Five same-run/},
 {name:'missing-computed-slope',change:m=>{delete m.get(0).slopes.primary;},error:/Complete computed terminal/}
];
for(const c of cases){const m=models(),restore=c.change(m);let result;try{if(c.error){assert.throws(()=>run(m),c.error);result={rejected:String(c.error)};}else{result=run(m);c.expect(result);}}finally{restore?.();}results.push({name:c.name,expectedFailureVerified:true,...result});fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({captureSha256:captureHash,baseline:control,results},null,2)+'\n');console.log(JSON.stringify(results.at(-1)));}
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(capture)).digest('hex'),captureHash);
