import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {nativeScalarLog2f} from '../dsp/native-scalar-log2.mjs';
const [oracle,reportPath,capturePath,...extra]=process.argv.slice(2);
if(!oracle||!reportPath||extra.length)throw new Error('Usage: log2f-oracle report.json [selection-log-capture.json]');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);},from=x=>{view.setUint32(0,x>>>0);return view.getFloat32(0);};
const words=new Set([0,0x80000000,1,0x80000001,0x7fffff,0x800000,0x7f7fffff,0xff7fffff,0x7f800000,0xff800000,0x7fc00000,0xffc01234,0x7f800001]);
for(let exponent=1;exponent<255;exponent++)for(let index=0;index<=64;index++){
 const center=(exponent<<23)+(index<<17)-0x10000;
 for(const delta of [-1,0,1])if(center+delta>0&&center+delta<0x7f800000)words.add(center+delta);
}
for(let i=0;i<24;i++)for(const delta of [-1,0,1])if(2**i+delta>=0)words.add(2**i+delta);
for(const threshold of [1e-3,1e-4,1e-5,1e-6,1e-7,1e-8,1e-12])for(let d=-4;d<=4;d++)words.add(bits(threshold)+d);
let seed=7;for(let i=0;i<200000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;words.add(seed%0x7f800000);if(i%8===0)words.add((seed|0x80000000)>>>0);}
let capture=[];
if(capturePath){const d=JSON.parse(fs.readFileSync(capturePath,'utf8'));if(d.point!=='0x100839c50'||d.errors.length||!d.records.length)throw new Error('Valid native selection log capture required');capture=d.records;for(const r of capture)words.add(bits(r.threshold));}
const inputs=[...words],run=spawnSync(oracle,[],{input:inputs.map(w=>w.toString(16)).join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024});
if(run.status!==0)throw new Error(run.stderr||String(run.error)||'System log2f oracle failed');
const actual=run.stdout.trim().split(/\s+/).map(s=>parseInt(s,16));if(actual.length!==inputs.length||actual.some(v=>!Number.isInteger(v)))throw new Error('Incomplete oracle');
let mismatches=0,bitwise=0,nanSemantic=0,mathCandidateDifferences=0;const failures=[];
for(let i=0;i<inputs.length;i++){
 const x=from(inputs[i]),a=from(actual[i]),p=nativeScalarLog2f(x);
 if(Number.isNaN(a)&&Number.isNaN(p))nanSemantic++;
 else if(bits(p)===actual[i])bitwise++;
 else{mismatches++;if(failures.length<20)failures.push({input:inputs[i],actual:actual[i],predicted:bits(p)});}
 const candidate=Math.fround(Math.log2(x));if(!(Number.isNaN(a)&&Number.isNaN(candidate))&&bits(candidate)!==actual[i])mathCandidateDifferences++;
}
let captureMismatches=0;for(const r of capture)if(bits(nativeScalarLog2f(r.threshold))!==bits(r.log2))captureMismatches++;
const report={passed:!mismatches&&!captureMismatches,count:inputs.length,bitwise,nanSemantic,mismatches,mathCandidateDifferences,capturedReturns:capture.length,captureMismatches,nanPayloadNotCompared:true,exceptionFlagsNotModeled:true,allFloat32InputsExhaustivelyTested:false,targetApplicationNotExecuted:true,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
