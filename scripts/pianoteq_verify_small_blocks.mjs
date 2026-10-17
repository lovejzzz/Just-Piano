import fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {nativeComplexDivide} from '../dsp/native-complex-reciprocal.mjs';import {extractSmallEigenvalues} from '../dsp/native-small-eigen.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('Oracle and NEW report required');
const view=new DataView(new ArrayBuffer(8)),bits=x=>{view.setFloat64(0,x);return view.getBigUint64(0).toString(16).padStart(16,'0');};
const number=w=>{view.setBigUint64(0,BigInt('0x'+w));return view.getFloat64(0);};
let seed=0x146c3a;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
const cases=[],edge=[0,-0,Number.MIN_VALUE,-Number.MIN_VALUE,2**-1022,-(2**-1022),1,-1,2,-2,Number.MAX_VALUE,-Number.MAX_VALUE];
for(const c of edge)for(const d of edge)if(c||d)for(const [a,b] of [[0,0],[-0,0],[1,-2],[Number.MAX_VALUE,Number.MAX_VALUE]])cases.push({op:'d',x:[a,b,c,d]});
for(let i=0;i<10000;i++){const make=()=>{const e=(random()%2045)-1022;return (random()&1?-1:1)*(1+random()/4294967296)*2**e;};cases.push({op:'d',x:Array.from({length:4},make)});}
for(let i=0;i<10000;i++){
 const x=Array.from({length:8},()=>((random()|0)/1048576));
 if(i%4===0){x[2]=0;x[3]=0;}if(i%11===0){x[0]=0;x[1]=0;x[6]=0;x[7]=0;}
 cases.push({op:'e',x:[...x,i%3===0?0:Number.EPSILON*3]});
}
for(const x of [[0,0,1,0,1,0,0,0],[0,0,0,1,1,0,0,0],[0,0,0,-1,1,0,0,0],[1,0,0,0,1,0,2,0]])cases.push({op:'e',x:[...x,0]});
const input=cases.map(r=>r.op+' '+r.x.map(bits).join(' ')).join('\n')+'\n',run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:16*1024*1024});
if(run.status!==0)throw new Error('Oracle failed '+run.stderr);const rows=run.stdout.trim().split('\n');if(rows.length!==cases.length)throw new Error('Incomplete oracle');
let mismatches=0,values=0,nanSemanticValues=0;const failures=[];
for(let i=0;i<cases.length;i++){
 const r=cases[i],actual=rows[i].trim().split(/\s+/),own=r.op==='d'?(()=>{const q=nativeComplexDivide(...r.x);return [q.real,q.imaginary];})():extractSmallEigenvalues({values:r.x.slice(0,8),order:2,tolerance:r.x[8]}).roots;
 for(let j=0;j<own.length;j++){values++;if(Number.isNaN(own[j])&&Number.isNaN(number(actual[j]))){nanSemanticValues++;continue;}if(bits(own[j])!==actual[j]){mismatches++;if(failures.length<20)failures.push({case:i,op:r.op,index:j,input:r.x.map(bits),actual:actual[j],predicted:bits(own[j])});}}
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');const report={passed:mismatches===0,cases:cases.length,doubleValues:values,nanSemanticValues,mismatches,failures,corpusSha256:sha(input),oracleSha256:sha(fs.readFileSync(oracle)),scope:'Compiler runtime division and independent C block extraction; not a native voice capture',generalQrVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
