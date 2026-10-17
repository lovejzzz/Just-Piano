import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {endpointSineWeights,morphPairedEndpointValue,morphEndpointAmplitudes} from '../dsp/endpoint-morph.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('Oracle and NEW report required');
const f=Math.fround,view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const value=x=>{view.setUint32(0,x);return view.getFloat32(0);};
const hex=x=>bits(x).toString(16).padStart(8,'0');
let seed=0x304b48;function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const cases=[],edges=[0,value(1),value(0x00800000),1e-20,0.01,1,100,value(0x7f7fffff)];
for(const a of edges)for(const b of edges)for(const t of [0,value(1),0.25,0.5,0.75,1])for(const db of [-40,0])cases.push([a,b,t,db]);
for(let i=0;i<100000;i++){
 let a,b;do{a=value(random()&0x7fffffff);}while(!Number.isFinite(a));do{b=value(random()&0x7fffffff);}while(!Number.isFinite(b));
 cases.push([i%5===0?0:a,i%7===0?0:b,f(random()/4294967296),i%11===0?0:-40]);
}
const input=cases.map(row=>row.map(hex).join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:32*1024*1024});
if(run.status!==0)throw new Error('Oracle failed '+run.stderr);
const rows=run.stdout.trim().split('\n');if(rows.length!==cases.length)throw new Error('Incomplete oracle');
let mismatches=0,nanSemanticComparisons=0;const failures=[];
for(let i=0;i<cases.length;i++){
 const [a,b,t,db]=cases[i],w=endpointSineWeights(t);
 const own=[w.coupled,w.separate,morphPairedEndpointValue(a,b,t),morphEndpointAmplitudes([a],[b],t,db)[0]];
 const words=rows[i].split(' ').map(x=>parseInt(x,16));if(words.length!==4)throw new Error('Invalid oracle row');
 for(let c=0;c<4;c++){
  if(Number.isNaN(own[c])&&Number.isNaN(value(words[c]))){nanSemanticComparisons++;continue;}
  if(bits(own[c])!==words[c]){mismatches++;if(failures.length<15)failures.push({i,column:c,input:cases[i].map(hex),own:hex(own[c]),oracle:words[c].toString(16)});}
 }
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={passed:mismatches===0,cases:cases.length,comparisons:cases.length*4,nanSemanticComparisons,mismatches,failures,
 corpusSha256:sha(input),outputSha256:sha(run.stdout),oracleSha256:sha(fs.readFileSync(oracle)),
 scope:'Independent C/system math for paired scalar frequency/decay and amplitude; no native endpoint trajectory',
 mappingAndSortingVerified:false,phaseVerified:false,wholeAudioVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
