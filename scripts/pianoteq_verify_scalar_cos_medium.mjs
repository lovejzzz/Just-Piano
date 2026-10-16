// Verify the inspected two-part cosf reduction with the actual system oracle.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {nativeScalarCos} from '../dsp/native-scalar-sin.mjs';
const [oracle,reportPath,capture,...extra]=process.argv.slice(2);
if(!oracle||!reportPath||extra.length)throw new Error('Usage: system-cosf-oracle report.json [prior-hardness-capture.json]');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);},from=x=>{view.setUint32(0,x);return view.getFloat32(0);};
const words=new Set([0,0x80000000,1,0x80000001]);
function add(x){x=Math.fround(x);if(Number.isFinite(x)&&Math.abs(x)<2**26)words.add(bits(x));}
for(const base of [2**-12,Math.PI/4,120,2**26])for(let delta=-4;delta<=4;delta++)for(const sign of [-1,1])add(sign*from(bits(base)+delta));
for(let i=1;i<65536;i+=3){const b=bits(i*Math.PI/2);for(const delta of [-1,0,1])for(const sign of [-1,1])add(sign*from(b+delta));}
let seed=7;
for(let i=0;i<200000;i++){
 seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 // Uniform bit patterns cover tiny inputs as well as the medium branch.
 words.add(((seed&0x80000000)|((seed>>>1)%0x4c800000))>>>0);
}
let capturedArguments=0;
if(capture){
 const d=JSON.parse(fs.readFileSync(capture,'utf8'));
 for(const r of d.records){
  if(r.stage!=='hardness'||!r.input.controls.repeatFlag)continue;
  const q=r.input,[columns,rows,,,referenceRow]=q.header;
  const frequency=rows?Math.fround(q.source.frequency[referenceRow*columns]):Math.fround(q.controls.fallbackFrequency);
  const argument=Math.fround((frequency*(2*Math.PI))*Math.fround(q.controls.age));
  if(Math.abs(argument)>=2**26)throw new Error('Captured argument outside supported range');
  add(argument);capturedArguments++;
 }
 if(!capturedArguments)throw new Error('No captured repeated-strike arguments');
}
const inputs=[...words];
const run=spawnSync(oracle,[],{input:inputs.map(v=>v.toString(16)).join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024});
if(run.status!==0)throw new Error(run.stderr||String(run.error)||'System cosine oracle failed');
const actual=run.stdout.trim().split(/\s+/).map(v=>parseInt(v,16));
if(actual.length!==inputs.length||actual.some(x=>!Number.isInteger(x)))throw new Error('Oracle count differs');
const failures=[];let mismatches=0,mathCosDifferences=0,medium=0;
for(let i=0;i<inputs.length;i++){
 const x=from(inputs[i]);if(Math.abs(x)>=120)medium++;
 const predicted=bits(nativeScalarCos(x));
 if(predicted!==actual[i]){mismatches++;if(failures.length<30)failures.push({input:inputs[i].toString(16),predicted:predicted.toString(16),actual:actual[i].toString(16)});}
 if(bits(Math.fround(Math.cos(x)))!==actual[i])mathCosDifferences++;
}
for(const x of [2**26,-(2**26),Infinity,-Infinity,NaN]){
 let rejected=false;try{nativeScalarCos(x);}catch{rejected=true;}if(!rejected)throw new Error('Unsupported cosf range accepted');
}
const report={passed:!mismatches,count:inputs.length,medium,capturedArguments,mismatches,mathCosDifferences,finiteRangeLimit:2**26,systemCosfOracle:true,targetApplicationNotExecuted:true,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
