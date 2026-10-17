import fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {nativeCubicQrStep} from '../dsp/native-cubic-qr.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('C oracle and NEW report required');
const view=new DataView(new ArrayBuffer(8)),bits=x=>{view.setFloat64(0,x);return view.getBigUint64(0).toString(16).padStart(16,'0');};
let seed=0x167cb1;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
const cases=[];
for(let i=0;i<4000;i++){
 const scale=2**((random()%81)-40),values=Array.from({length:18},()=>((random()|0)/1048576)*scale);
 // Valid Hessenberg matrices, including complex subdiagonals and real subsets.
 values[4]=values[5]=0;if(i%7===0)for(let j=1;j<18;j+=2)values[j]=i%2?-0:0;
 if(values[2]===0&&values[3]===0)values[2]=scale;
 cases.push({values,exceptionalShift:i%2===0});
}
const input=cases.map(a=>`${+a.exceptionalShift} ${a.values.map(bits).join(' ')}`).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:16*1024*1024});if(run.status!==0)throw new Error('C oracle failed '+run.stderr);
const lines=run.stdout.trim().split('\n');if(lines.length!==cases.length)throw new Error('Incomplete C output');
let doubleValues=0,mismatches=0;const failures=[];
for(let i=0;i<cases.length;i++){
 const own=nativeCubicQrStep(cases[i]),predicted=[...own.seed,...own.initial,...own.final,...own.values],actual=lines[i].trim().split(/\s+/);
 if(actual.shift()!=='ok'||actual.length!==predicted.length)throw new Error('Invalid oracle shape');
 for(let j=0;j<predicted.length;j++){doubleValues++;if(bits(predicted[j])!==actual[j]){mismatches++;if(failures.length<20)failures.push({case:i,index:j,predicted:bits(predicted[j]),actual:actual[j]});}}
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={passed:!mismatches,cases:cases.length,ordinary:2000,exceptional:2000,doubleValues,mismatches,failures,corpusSha256:sha(input),oracleSha256:sha(fs.readFileSync(oracle)),scope:'Independent C/CRT cubic step arithmetic, not native internal matrix capture',generalQrVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
