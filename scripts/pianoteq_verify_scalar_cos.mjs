import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {nativeScalarCos} from '../dsp/native-scalar-sin.mjs';
const [oracle,reportPath,...extra]=process.argv.slice(2);
if(!oracle||!reportPath||extra.length)throw new Error('Usage: system-cosf-oracle report.json');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);},fromBits=x=>{view.setUint32(0,x);return view.getFloat32(0);};
const inputs=[0,-0];
for(let i=-11900;i<=11900;i+=7)inputs.push(Math.fround(i/100));
for(const base of [2**-12,Math.PI/4,...Array.from({length:75},(_,i)=>i*Math.PI/2)]){
 const b=bits(base);for(const delta of [-1,0,1])for(const sign of [-1,1]){const v=sign*fromBits(b+delta);if(Number.isFinite(v)&&Math.abs(v)<120)inputs.push(v);}
}
const f=Math.fround;
for(let block=0;block<32;block++)for(let j=1;j<4;j++)for(let lane=0;lane<4;lane++)inputs.push(f(f(f(-2*Math.PI/1024)*j)*(block*4+lane)));
const run=spawnSync(oracle,[],{input:inputs.map(v=>bits(v).toString(16)).join('\n')+'\n',encoding:'utf8'});
if(run.status!==0)throw new Error(run.stderr||'System cosine oracle failed');
const actual=run.stdout.trim().split(/\s+/).map(v=>parseInt(v,16));if(actual.length!==inputs.length)throw new Error('Oracle count differs');
const failures=[];let mismatches=0;
for(let i=0;i<inputs.length;i++){const predicted=bits(nativeScalarCos(inputs[i]));if(predicted!==actual[i]){mismatches++;if(failures.length<30)failures.push({input:inputs[i],predicted:predicted.toString(16),actual:actual[i].toString(16)});}}
const report={passed:!mismatches,count:inputs.length,mismatches,finiteRangeLimit:120,systemCosfOracle:true,targetApplicationNotExecuted:true,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
