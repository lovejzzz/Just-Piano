import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {morphEndpointSources} from '../dsp/endpoint-source-morph.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('Oracle and NEW report required');
const fields=['frequency','decay','amplitude','phase'],view=new DataView(new ArrayBuffer(4)),f=Math.fround;
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const hex=x=>bits(x).toString(16).padStart(8,'0');
let seed=0x048848;function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
function source(rows,columns,ties){
 const result={rows,columns};
 for(const field of fields)result[field]=Array.from({length:rows*columns},()=>{
  if(field==='frequency')return ties?random()%5:f(random()/4294967296*20000);
  if(field==='decay')return f(random()/4294967296*500);
  if(field==='amplitude')return random()%3===0?0:f(random()/4294967296*10);
  return f(random()/4294967296*200-100);
 });return result;
}
const cases=[];
for(let i=0;i<2000;i++){
 const ra=random()%151,rb=random()%151,columns=1+random()%3;
 const blend=[0,.25,.5,.75,1,f(1e-20),f(.99999994),f(random()/4294967296)][i%8];
 cases.push({coupled:source(ra,columns,i%2===0),separate:source(rb,columns,i%2===0),blend});
}
const input=cases.map(({coupled:a,separate:b,blend})=>[a.rows,b.rows,a.columns,hex(blend),...fields.flatMap(k=>a[k].map(hex)),...fields.flatMap(k=>b[k].map(hex))].join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:64*1024*1024});
if(run.status!==0)throw new Error('Source oracle failed '+run.stderr);
const rows=run.stdout.trim().split('\n');if(rows.length!==cases.length)throw new Error('Incomplete oracle');
let mismatches=0,comparedFloat32Values=0;const failures=[];
for(let i=0;i<cases.length;i++){
 const own=morphEndpointSources(cases[i]),tokens=rows[i].split(' ');
 if(Number(tokens.shift())!==own.rows||Number(tokens.shift())!==own.columns||tokens.length!==own.rows*own.columns*4)throw new Error('Oracle shape mismatch');
 const expected=tokens.map(x=>parseInt(x,16)),predicted=fields.flatMap(k=>Array.from(own[k],bits));
 for(let c=0;c<expected.length;c++){
  comparedFloat32Values++;
  if(expected[c]!==predicted[c]){mismatches++;if(failures.length<15)failures.push({i,column:c,own:predicted[c].toString(16),oracle:expected[c].toString(16)});}
 }
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={passed:mismatches===0,cases:cases.length,comparedFloat32Values,mismatches,failures,
 corpusSha256:sha(input),outputSha256:sha(run.stdout),oracleSha256:sha(fs.readFileSync(oracle)),
 scope:'Independent C++/system math plus standalone ARM phase-wrap instructions, explicit endpoint tables; not native source production',
 nativeEndpointCaptureVerified:false,wholeAudioVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
