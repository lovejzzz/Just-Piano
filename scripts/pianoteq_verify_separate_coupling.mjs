import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {couplingArguments} from '../dsp/coupling-inputs.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('Oracle and NEW report required');
const f=Math.fround,view=new DataView(new ArrayBuffer(8));
const hex=x=>{view.setFloat64(0,x);return view.getBigUint64(0).toString(16).padStart(16,'0');};
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const value=w=>{view.setUint32(0,w);return view.getFloat32(0);};
let seed=0x103310;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
const cases=[],edge=[value(1),value(0x007fffff),value(0x00800000),0.01,0.1,0.5,1,2,10,100,value(0x7f7fffff)];
for(const power of edge)for(const t of [0,0.25,0.5,0.75,1])cases.push([440,0.00001,440,1,1,0,power,-3,5,t]);
for(let i=0;i<100000;i++){
  let power;do{power=value(random()&0x7fffffff);}while(!(power>0)||!Number.isFinite(power));
  cases.push([20+random()/4294967296*980,random()/4294967296*0.001,f(20+random()/4294967296*980),
    f(0.5+random()/4294967296),1+random()%20,f(random()/4294967296*0.0001),power,
    f(random()/4294967296*100-50),f(random()/4294967296*100-50),f(random()/4294967296)]);
}
const input=cases.map(row=>row.map(hex).join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:32*1024*1024});
if(run.status!==0)throw new Error('Separate coupling oracle failed '+run.stderr);
const actual=run.stdout.trim().split('\n');if(actual.length!==cases.length)throw new Error('Incomplete oracle');
let mismatches=0;const failures=[];
for(let i=0;i<cases.length;i++){
  const [base,stiffness,fundamental,coordinateScale,mode,spread,power,left,right,note]=cases[i];
  const own=couplingArguments({fundamental,coordinateScale,mode,note,componentPowerScale:[power],
    endpoint:{kind:'separate',component:2,base,reference:fundamental,stiffness,offsets:[0],spread:[spread]},
    frequencyGrid:{coordinates:[0,1],curves:[{x:[],y:[left]},{x:[],y:[right]}]},
    runtimeCurveModes:[{flags:0,special:0,dimension:1},{flags:0,special:0,dimension:1}]});
  const predicted=[...['s0','s1','s2','s3'].map(k=>own.inputs[k]),own.componentPower.logarithm,own.baseExtraDb].map(bits);
  const words=actual[i].split(' ').map(x=>Number.parseInt(x,16));
  if(words.length!==6||words.some(x=>!Number.isInteger(x)))throw new Error('Invalid oracle row');
  for(let c=0;c<6;c++)if(predicted[c]!==words[c]){mismatches++;if(failures.length<20)failures.push({i,column:c,input:cases[i].map(hex),predicted:predicted[c],actual:words[c]});}
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={passed:mismatches===0,cases:cases.length,comparedFloat32Values:cases.length*6,mismatches,failures,
  sourceIndexRepeatedFromOneElementVector:true,oracleSha256:sha(fs.readFileSync(oracle)),corpusSha256:sha(input),outputSha256:sha(run.stdout),
  scope:'Independent C/system math; not a native Pianoteq separate-component voice capture',nativeSeparateVoiceTrajectoryVerified:false,wholeAudioVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
