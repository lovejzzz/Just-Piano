import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {prepareModalInputs,referenceModeIndex,normalizeSourceAmplitudes} from '../dsp/modal-source.mjs';
import {endpointReferenceFrequency} from '../dsp/endpoint-source-reference.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('Oracle and NEW report required');
const f=Math.fround,view=new DataView(new ArrayBuffer(8));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const value=x=>{view.setUint32(0,x);return view.getFloat32(0);};
const hex=x=>bits(x).toString(16).padStart(8,'0');
const doubleHex=x=>{view.setFloat64(0,x);return view.getBigUint64(0).toString(16).padStart(16,'0');};
let seed=0x104654;function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const cases=[];
for(let i=0;i<10000;i++){
 const n=1+random()%5,k=1+random()%n,rows=random()%10,frequency=f(20+random()/4294967296*4000),blend=[0,1,.25,.5,.75,f(random()/4294967296)][i%6];
 const offsets=Array.from({length:n},()=>f(random()/4294967296*20-10));
 const ratios=Array.from({length:k},()=>f(.5+random()/4294967296*2));
 const frequencies=Array.from({length:rows*n},()=>f(frequency*(.5+random()/4294967296*2)));
 const amplitude=Array.from({length:rows*n},()=>{if(i%17===0)return 0;let x;do{x=value(random()&0x7fffffff);}while(!Number.isFinite(x));return x;});
 cases.push({n,k,rows,frequency,blend,offsets,ratios,frequencies,amplitude});
}
const input=cases.map(x=>[x.n,x.k,x.rows,hex(x.frequency),hex(x.blend),...x.offsets.map(hex),...x.ratios.map(hex),...x.frequencies.map(hex),...x.amplitude.map(hex)].join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:32*1024*1024});
if(run.status!==0)throw new Error('Reference oracle failed '+run.stderr);
const lines=run.stdout.trim().split('\n');if(lines.length!==cases.length)throw new Error('Incomplete oracle');
let mismatches=0,float32Comparisons=0,nanSemanticComparisons=0;const failures=[];
for(let i=0;i<cases.length;i++){
 const x=cases[i],prepared=prepareModalInputs({frequency:x.frequency,offsets:x.offsets,offsetExponent:0,stiffness:0,componentStiffness:[0],spread:0,frequencyRatios:x.ratios,blend:x.blend});
 const ref=endpointReferenceFrequency(prepared),index=referenceModeIndex(x.frequencies,x.n,ref);
 const norm=x.amplitude.length?normalizeSourceAmplitudes(x.amplitude):{maximum:0,scale:1,values:[]};
 const tokens=lines[i].split(' '),actualRef=tokens.shift(),actualIndex=Number(tokens.shift()),words=tokens.map(w=>parseInt(w,16));
 const own=[norm.maximum,norm.scale,...norm.values];if(own.length!==words.length)throw new Error('Oracle shape mismatch');
 for(const [stage,a,b] of [['reference',doubleHex(ref),actualRef],['index',index,actualIndex]])if(a!==b){mismatches++;if(failures.length<15)failures.push({i,stage,own:a,oracle:b});}
 for(let c=0;c<own.length;c++){
  float32Comparisons++;
  if(Number.isNaN(own[c])&&Number.isNaN(value(words[c]))){nanSemanticComparisons++;continue;}
  if(bits(own[c])!==words[c]){mismatches++;if(failures.length<15)failures.push({i,stage:'normalization',column:c,own:hex(own[c]),oracle:words[c].toString(16)});}
 }
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={passed:mismatches===0,cases:cases.length,doubleReferenceComparisons:cases.length,referenceIndexComparisons:cases.length,float32Comparisons,nanSemanticComparisons,mismatches,failures,
 corpusSha256:sha(input),outputSha256:sha(run.stdout),oracleSha256:sha(fs.readFileSync(oracle)),
 scope:'Independent C/system fma reference and normalization, explicit offset exponent zero; not native endpoint trajectory',wholeAudioVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
