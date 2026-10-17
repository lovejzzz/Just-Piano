import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {applySourcePhaseOffsets,sourcePhaseCoordinate} from '../dsp/source-phase-offsets.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('Oracle and NEW report required');
const names=['globalDegrees','evenOffset','oddDegrees','evenDegrees','oddDelay','evenDelay'],f=Math.fround,view=new DataView(new ArrayBuffer(8));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const value=w=>{view.setUint32(0,w);return view.getFloat32(0);};
const hex=x=>bits(x).toString(16).padStart(8,'0');
const doubleHex=x=>{view.setFloat64(0,x);return view.getBigUint64(0).toString(16).padStart(16,'0');};
let seed=0x103f08;function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
function finite(){let x;do{x=value(random());}while(!Number.isFinite(x));return x;}
const coordinates=[0,-0,-1,1,2,3,4,.5,1.5,-.5,4294967040,4294967296,4294967808,value(0x7f7fffff),-value(0x7f7fffff)];
const cases=[];
for(let i=0;i<100000;i++){
 const columns=1+random()%4,coordinate=i<coordinates.length*16?coordinates[Math.floor(i/16)]:i%2?f(random()%200):finite();
 const controls=Object.fromEntries(names.map((k,j)=>[k,i%(j+3)===0?0:f(random()/4294967296*2000-1000)]));
 const phaseConstant=i%7===0?0:i%3===0?Math.PI:(random()/4294967296*100-50);
 cases.push({rows:1,columns,coordinates:[coordinate],controls,phaseConstant,
  frequency:Array.from({length:columns},()=>i%5===0?finite():f(random()/4294967296*20000)),
  phase:Array.from({length:columns},()=>i%5===0?finite():f(random()/4294967296*20-10))});
}
const input=cases.map(x=>[x.columns,doubleHex(x.phaseConstant),hex(x.coordinates[0]),...names.map(k=>hex(x.controls[k])),...x.frequency.map(hex),...x.phase.map(hex)].join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:64*1024*1024});
if(run.status!==0)throw new Error('Phase offset oracle failed '+run.stderr);
const lines=run.stdout.trim().split('\n');if(lines.length!==cases.length)throw new Error('Incomplete oracle');
let mismatches=0,float32Comparisons=0;const failures=[],summary={};
for(let i=0;i<cases.length;i++){
 const x=cases[i],own=applySourcePhaseOffsets(x),kind=sourcePhaseCoordinate(x.coordinates[0]),tokens=lines[i].split(' ');
 const integer=Number(tokens.shift()),eligible=Boolean(Number(tokens.shift())),words=tokens.map(w=>parseInt(w,16));
 if(words.length!==x.columns)throw new Error('Oracle shape mismatch');
 for(const [stage,a,b] of [['unsigned',kind.integer,integer],['eligible',kind.eligible,eligible]])if(a!==b){mismatches++;if(failures.length<15)failures.push({i,stage,own:a,oracle:b});}
 for(const [k,v] of Object.entries(own.summary))summary[k]=(summary[k]||0)+v;
 for(let c=0;c<words.length;c++){
  float32Comparisons++;if(bits(own.phase[c])!==words[c]){mismatches++;if(failures.length<15)failures.push({i,column:c,own:hex(own.phase[c]),oracle:words[c].toString(16)});}
 }
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={passed:mismatches===0,cases:cases.length,float32Comparisons,unsignedComparisons:cases.length,eligibilityComparisons:cases.length,mismatches,failures,summary,
 corpusSha256:sha(input),outputSha256:sha(run.stdout),oracleSha256:sha(fs.readFileSync(oracle)),
 scope:'Independent standalone ARM unsigned conversion and C/system fma; phase constant and controls explicit',
 nativeNonzeroPhaseTrajectoryVerified:false,wholeAudioVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
