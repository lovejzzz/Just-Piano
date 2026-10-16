// Compare the bounded scalar sinf reconstruction with independent system libm.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {nativeScalarSin} from '../dsp/native-scalar-sin.mjs';
import {fma32} from '../dsp/modal-kernel.mjs';
const [oracle,reportPath,...extra]=process.argv.slice(2);
if(!oracle||!reportPath||extra.length)throw new Error('Usage: system-sinf-oracle report.json');
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const from=x=>{view.setUint32(0,x);return view.getFloat32(0);};
const words=new Set([0,0x80000000,1,0x80000001,0x39800000,0x397fffff,0x3f490fdb,0x3f490fda]);
for(let i=0;i<=624;i++){
  const delta=fma32(Math.fround(1/48000),i,-Math.fround(.003));
  words.add(bits(Math.fround((Math.fround(1/Math.fround(.01))*(Math.PI/2))*delta)));
}
let seed=7;
for(let i=0;i<2000;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  words.add(bits(Math.fround((seed/2**32*2-1)*119.999)));
}
const input=[...words];
const run=spawnSync(oracle,[],{input:input.map(x=>x.toString(16)).join('\n')+'\n',encoding:'utf8'});
if(run.status!==0)throw new Error(run.stderr||'Oracle did not exit zero');
const output=run.stdout.trim().split(/\s+/).map(x=>parseInt(x,16));
if(output.length!==input.length||output.some(x=>!Number.isInteger(x)))throw new Error('Incomplete oracle output');
const failures=[];
input.forEach((word,i)=>{
  const predicted=bits(nativeScalarSin(from(word)));
  if(predicted!==output[i])failures.push({input:word,predicted,actual:output[i]});
});
for(const unsupported of [120,-120,Infinity,NaN]){
  let rejected=false;try{nativeScalarSin(unsupported);}catch{rejected=true;}
  if(!rejected)throw new Error('Unsupported sinf range was accepted');
}
const report={passed:!failures.length,count:input.length,mismatches:failures.length,
  oracleExit:run.status,method:'independent system sinf C oracle',boundedFiniteRange:120,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,failures:undefined}));
if(!report.passed)process.exitCode=1;
