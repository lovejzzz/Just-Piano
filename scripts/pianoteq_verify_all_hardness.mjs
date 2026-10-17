// Tests a standalone instruction transcription; never reports native voice coverage.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {applyHammerAllHardness} from '../dsp/hammer-all-hardness.mjs';
const [oracle,output]=process.argv.slice(2);
if(!output)throw new Error('Standalone oracle and NEW report required');
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const value=w=>{view.setUint32(0,w);return view.getFloat32(0);};
let seed=0x618355;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
const groups=[0,-0,1,-1,2,-2,0.25,0.5,1.5,3,value(1),value(0x80000001),value(0x7f7fffff),value(0xff7fffff)];
const all=[-2,-1,value(0xbf7fffff),-0.5,-0,0,value(1),0.25,value(0x3effffff),0.5,value(0x3f000001),0.75,1,2];
const cases=[];
for(const a of all)for(const p of groups)for(const m of groups)cases.push([p,m,groups[(cases.length*7)%groups.length],a]);
for(let i=0;i<100000;i++){
  const triple=Array.from({length:3},()=>{let n;do{n=value(random());}while(!Number.isFinite(n));return n;});
  cases.push([...triple,Math.fround(random()/4294967296*2.2-1.1)]);
}
const input=cases.map(row=>row.map(x=>bits(x).toString(16)).join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:32*1024*1024});
if(run.status!==0)throw new Error('Instruction oracle failed: '+run.stderr);
const rows=run.stdout.trim().split('\n');if(rows.length!==cases.length)throw new Error('Incomplete oracle output');
let mismatches=0;const failures=[];
for(let i=0;i<cases.length;i++){
  const actual=rows[i].split(' ').map(x=>Number.parseInt(x,16));
  if(actual.length!==3||actual.some(x=>!Number.isInteger(x)))throw new Error('Invalid oracle words');
  const predicted=applyHammerAllHardness(cases[i].slice(0,3),cases[i][3]).map(bits);
  for(let c=0;c<3;c++)if(actual[c]!==predicted[c]){mismatches++;if(failures.length<20)failures.push({i,column:c,input:cases[i].map(bits),actual:actual[c],predicted:predicted[c]});}
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={passed:mismatches===0,cases:cases.length,comparedFloat32:cases.length*3,mismatches,failures,
  instructionTranscriptionOnly:true,newNativeVoiceCapture:false,allHardnessAudioEquivalent:false,
  oracleSha256:sha(fs.readFileSync(oracle)),corpusSha256:sha(input),outputSha256:sha(run.stdout)};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
