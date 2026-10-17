import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {sortEndpointFrequencyIndices} from '../dsp/endpoint-frequency-sort.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('Oracle and NEW report required');
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0).toString(16).padStart(8,'0');};
const value=w=>{view.setUint32(0,w);return view.getFloat32(0);};
let seed=0x7fd9c4;function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const cases=[];
for(let n=0;n<=140;n++){
  const patterns=[Array(n).fill(440),Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>n-i),
    Array.from({length:n},(_,i)=>i%3),Array.from({length:n},(_,i)=>Math.min(i,n-i)),
    Array.from({length:n},(_,i)=>i%2?-0:0)];
  for(const values of patterns)for(const mode of [0,1])cases.push({values,mode});
}
for(let i=0;i<5000;i++){
  const n=1+random()%1000,values=Array.from({length:n},()=>{
    if(i%3===0)return random()%17;
    let x;do{x=value(random());}while(!Number.isFinite(x));return x;
  });cases.push({values,mode:i%2});
}
const input=cases.map(({values,mode})=>[values.length,mode,...values.map(bits)].join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:64*1024*1024});
if(run.status!==0)throw new Error('Sort oracle failed '+run.stderr);
const rows=run.stdout.trim().split('\n');if(rows.length!==cases.length)throw new Error('Incomplete oracle');
let mismatches=0,comparedIndices=0,unstableCases=0;const failures=[],branches={};
for(let i=0;i<cases.length;i++){
  const {values,mode}=cases[i],own=sortEndpointFrequencyIndices(values,mode?{depthLimit:0}:{});
  const words=rows[i].split(' ').map(Number);if(words.shift()!==values.length||words.length!==values.length)throw new Error('Invalid oracle row');
  for(const [k,v] of Object.entries(own.branches))branches[k]=(branches[k]||0)+v;
  for(let c=0;c<words.length;c++){
    comparedIndices++;
    if(own.indices[c]!==words[c]){mismatches++;if(failures.length<15)failures.push({i,column:c,mode,length:values.length,own:own.indices[c],oracle:words[c]});}
  }
  if(own.indices.some((index,c)=>c>0&&Math.fround(values[index])===Math.fround(values[own.indices[c-1]])&&index<own.indices[c-1]))unstableCases++;
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={passed:mismatches===0,cases:cases.length,comparedIndices,mismatches,failures,branches,unstableCases,
  corpusSha256:sha(input),outputSha256:sha(run.stdout),oracleSha256:sha(fs.readFileSync(oracle)),
  scope:'Independent local SDK libc++ index sort/partial_sort; not native Pianoteq endpoint capture',wholeAudioVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
