import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {nativeScalarExp2f} from '../dsp/native-scalar-exp.mjs';
import {nativeScalarLog10f} from '../dsp/native-scalar-log10.mjs';
const [oracle,reportPath,replayPath,...extra]=process.argv.slice(2);
if(!oracle||!reportPath||extra.length)throw new Error('Usage: bulk-oracle report.json [history-replay.json]');
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const from=x=>{view.setUint32(0,x>>>0);return view.getFloat32(0);};
const inputs=new Map();
const add=(fn,word)=>inputs.set(fn+':'+(word>>>0),{fn,word:word>>>0});
for(const fn of ['exp2f','log10f'])for(const word of [0,0x80000000,1,0x80000001,0x007fffff,0x00800000,0x7f7fffff,0xff7fffff,0x7f800000,0xff800000,0x7fc00000,0xffc01234,0x7f800001])add(fn,word);
for(let n=-19200;n<=16384;n++)for(const x of [n/128,(n+.5)/128]){
 const b=bits(x);for(const delta of [-1,0,1])if(b+delta>=0&&b+delta<=0xffffffff)add('exp2f',b+delta);
}
for(const x of [-256,-150,-149,-126,0,128,256]){const b=bits(x);for(let d=-4;d<=4;d++)if(b+d>=0&&b+d<=0xffffffff)add('exp2f',b+d);}
for(let exponent=1;exponent<255;exponent++)for(let index=0;index<=64;index++){
 const center=(exponent<<23)+(index<<17)-0x10000;
 for(const delta of [-1,0,1])if(center+delta>0&&center+delta<0x7f800000)add('log10f',center+delta);
}
for(let i=0;i<24;i++)for(const delta of [-1,0,1])if(2**i+delta>=0)add('log10f',2**i+delta);
let seed=7;
for(let i=0;i<200000;i++){
 seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 add('exp2f',bits(Math.fround((seed/2**32*2-1)*256)));
 add('log10f',seed%0x7f800000);
 if(i%8===0)add('log10f',seed|0x80000000);
}
let observedCalls=0;
if(replayPath){
 const d=JSON.parse(fs.readFileSync(replayPath,'utf8'));
 if(!d.passed||!Array.isArray(d.mathCalls)||!d.mathCalls.length)throw new Error('Passing replay with history math calls required');
 for(const c of d.mathCalls){if(!['exp2f','log10f'].includes(c.function))throw new Error('Unsupported observed function');add(c.function,bits(c.input));observedCalls++;}
}
const cases=[...inputs.values()];
const run=spawnSync(oracle,[],{input:cases.map(c=>c.fn+' '+c.word.toString(16)).join('\n')+'\n',encoding:'utf8',maxBuffer:64*1024*1024});
if(run.status!==0)throw new Error(run.stderr||String(run.error)||'System oracle failed');
const actual=run.stdout.trim().split(/\s+/).map(s=>parseInt(s,16));
if(actual.length!==cases.length||actual.some(v=>!Number.isInteger(v)))throw new Error('Incomplete oracle response');
const byFunction={},failures=[];let mismatches=0;
for(let i=0;i<cases.length;i++){
 const {fn,word}=cases[i],x=from(word),a=from(actual[i]);
 const p=fn==='exp2f'?nativeScalarExp2f(x):nativeScalarLog10f(x);
 const q=byFunction[fn]??={count:0,bitwise:0,nanSemantic:0,mismatches:0,mathCandidateDifferences:0};q.count++;
 if(Number.isNaN(a)&&Number.isNaN(p))q.nanSemantic++;
 else if(bits(p)===actual[i])q.bitwise++;
 else {mismatches++;q.mismatches++;if(failures.length<30)failures.push({fn,input:word.toString(16),predicted:bits(p).toString(16),actual:actual[i].toString(16)});}
 const candidate=Math.fround(fn==='exp2f'?2**x:Math.log10(x));
 if(!(Number.isNaN(a)&&Number.isNaN(candidate))&&bits(candidate)!==actual[i])q.mathCandidateDifferences++;
}
const report={passed:!mismatches,count:cases.length,observedCalls,mismatches,byFunction,exceptionFlagsNotModeled:true,nanPayloadNotCompared:true,allFloat32InputsExhaustivelyTested:false,targetApplicationNotExecuted:true,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
