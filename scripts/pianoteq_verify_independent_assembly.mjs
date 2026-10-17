import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {assembleIndependentSource,independentSourceWeights} from '../dsp/independent-source-assembly.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('Oracle and NEW report required');
const f=Math.fround,view=new DataView(new ArrayBuffer(4)),fields=['frequency','decay','amplitude','phase'];
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const value=w=>{view.setUint32(0,w);return view.getFloat32(0);};
const hex=x=>bits(x).toString(16).padStart(8,'0');
let seed=0x103a2c;function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const cases=[];let specialCases=0,emptyComponents=0,originalZeroRows=0;
for(let i=0;i<10000;i++){
 const count=1+random()%4,scaleCount=1+random()%count,rowLimit=random()%33;
 const componentAmplitudeScale=Array.from({length:scaleCount},()=>f(random()/4294967296*8-4));
 const weights=Array.from({length:random()%40},()=>f(random()/4294967296*100));
 const frequencyRatios=i%2?[.5,.5]:[1];if(i%2)specialCases++;
 const components=Array.from({length:count},()=>{
  const rows=random()%(rowLimit+1),active=rows?random()%(rows+1):0;if(!rows)emptyComponents++;
  originalZeroRows+=rows-active;
  return {rows,columns:1,frequency:Array.from({length:rows},(_,r)=>r>=active?(r%2?-0:0):f((r+1)*(20+random()/4294967296*2000))),
   decay:Array.from({length:rows},()=>f(random()/4294967296*1000)),
   amplitude:Array.from({length:rows},()=>{if(i%11===0)return value(0x7f7fffff);return f(random()/4294967296*10);}),
   phase:Array.from({length:rows},()=>f(random()/4294967296*20-10))};
 });cases.push({components,componentAmplitudeScale,rowLimit,weights,frequencyRatios});
}
const input=cases.map(x=>[x.components.length,x.componentAmplitudeScale.length,x.rowLimit,x.weights.length,x.frequencyRatios.length,
 ...x.componentAmplitudeScale.map(hex),...x.weights.map(hex),...x.frequencyRatios.map(hex),
 ...x.components.flatMap(c=>[c.rows,...fields.flatMap(k=>c[k].map(hex))])].join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:64*1024*1024});
if(run.status!==0)throw new Error('Assembly oracle failed '+run.stderr);
const lines=run.stdout.trim().split('\n');if(lines.length!==cases.length)throw new Error('Incomplete oracle');
let mismatches=0,float32Comparisons=0;const failures=[];
for(let i=0;i<cases.length;i++){
 const x=cases[i],own=assembleIndependentSource(x),weights=independentSourceWeights(x.weights,x.frequencyRatios),tokens=lines[i].split(' ');
 if(Number(tokens.shift())!==own.rows||Number(tokens.shift())!==own.columns||Number(tokens.shift())!==weights.length)throw new Error('Oracle shape mismatch');
 const expected=tokens.map(w=>parseInt(w,16)),predicted=[...weights,...fields.flatMap(k=>Array.from(own[k]))].map(bits);
 if(expected.length!==predicted.length)throw new Error('Incomplete oracle values');
 for(let c=0;c<expected.length;c++){
  float32Comparisons++;if(predicted[c]!==expected[c]){mismatches++;if(failures.length<15)failures.push({i,column:c,own:predicted[c].toString(16),oracle:expected[c].toString(16)});}
 }
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={passed:mismatches===0,cases:cases.length,float32Comparisons,mismatches,failures,specialCases,emptyComponents,originalZeroRows,
 corpusSha256:sha(input),outputSha256:sha(run.stdout),oracleSha256:sha(fs.readFileSync(oracle)),
 scope:'Independent C/system fmaf assembly; component four tables remain explicit, not native independent voice trajectory',wholeAudioVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
