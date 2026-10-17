import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {nativeComplexReciprocal} from '../dsp/native-complex-reciprocal.mjs';
import {singleComponentPole} from '../dsp/single-component-pole.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('Oracle and NEW report required');
const view=new DataView(new ArrayBuffer(8));
const bits=x=>{view.setFloat64(0,x);return view.getBigUint64(0).toString(16).padStart(16,'0');};
const fbits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
let seed=0x19d2c1;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
const cases=[];
const edge=[0,-0,Number.MIN_VALUE,-Number.MIN_VALUE,2**-1022,-(2**-1022),2**-500,-(2**-500),1,-1,2,-2,2**500,-(2**500),Number.MAX_VALUE,-Number.MAX_VALUE];
for(const p of edge)for(const q of edge)if(p!==0||q!==0)cases.push([p,q,1,440]);
for(let i=0;i<100000;i++){
  const make=()=>{const exp=(random()%2045)-1022;return (random()&1?-1:1)*(1+random()/4294967296)*2**exp;};
  cases.push([make(),make(),1+random()%100,40+random()/4294967296*10000]);
}
const input=cases.map(row=>row.map(bits).join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:32*1024*1024});
if(run.status!==0)throw new Error('Oracle failed '+run.stderr);
const rows=run.stdout.trim().split('\n');if(rows.length!==cases.length)throw new Error('Incomplete oracle');
let mismatches=0,reciprocalValues=0,poleValues=0,nonfinitePoleCases=0;const failures=[];
for(let i=0;i<cases.length;i++){
  const [p,q,mode,center]=cases[i],actual=rows[i].split(' '),own=nativeComplexReciprocal(p,q);
  const compare=(name,predicted,expected)=>{if(predicted!==expected){mismatches++;if(failures.length<20)failures.push({i,name,input:cases[i].map(bits),predicted,expected});}};
  compare('real',bits(own.real),actual[0]);compare('imaginary',bits(own.imaginary),actual[1]);reciprocalValues+=2;
  const fb=Number.parseInt(actual[2],16),db=Number.parseInt(actual[3],16);
  if((fb&0x7f800000)===0x7f800000||(db&0x7f800000)===0x7f800000){
    nonfinitePoleCases++;let threw=false;try{singleComponentPole({p,q,mode,center});}catch{threw=true;}
    if(!threw)compare('nonfinite outputs rejected',false,true);
  }else{
    const pole=singleComponentPole({p,q,mode,center});compare('frequency',fbits(pole.frequency[0]),fb);compare('decay',fbits(pole.decay[0]),db);poleValues+=2;
  }
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={passed:mismatches===0,cases:cases.length,reciprocalDoubleValues:reciprocalValues,poleFloat32Values:poleValues,
  nonfinitePoleCases,mismatches,failures,oracleSha256:sha(fs.readFileSync(oracle)),corpusSha256:sha(input),outputSha256:sha(run.stdout),
  scope:'Standalone compiler complex division and fast-path arithmetic; not native Pianoteq voice capture',nativeVoiceTrajectoryVerified:false,fullAudioVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
