import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {nativeVectorCos} from '../dsp/native-vector-cos.mjs';
const [oracle,reportPath,capturePath,...extra]=process.argv.slice(2);
if(!oracle||!reportPath||extra.length)throw new Error('Usage: oracle report.json [final-initial-capture.json]');
const f=Math.fround,v=new DataView(new ArrayBuffer(4));
const bits=x=>{v.setFloat32(0,x);return v.getUint32(0);},from=x=>{v.setUint32(0,x>>>0);return v.getFloat32(0);};
const groups=[[0,-0,Infinity,NaN],[0,-0,1,-1],[1e6,-1e6,1,0],[1e6+1,1,0,-0],[3.4e38,-3.4e38,1e-30,-1e-30]];
for(const x of [0,Math.PI/2,Math.PI,1e6,from(0x49742400)])for(let d=-4;d<=4;d++){
 const y=from(bits(x)+d);groups.push([y,-y,f(y+.25),0]);groups.push([y,-y,from(0x7f7fffff),1]);
}
let seed=7;for(let i=0;i<30000;i++){
 const words=Array.from({length:4},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;});
 groups.push(words.map(w=>i%3===0?f(from(w)):i%3===1?f((w/2**32-.5)*2e6):f((w/2**32-.5)*200)));
}
let nativeArgumentGroups=0;
if(capturePath){
 const d=JSON.parse(fs.readFileSync(capturePath,'utf8'));
 if(!d.complete||d.errors.length||d.finalCount!==5)throw new Error('Complete final initial capture required');
 for(const r of d.records.filter(r=>r.stage==='final')){
  if(r.target.controls['0x7b0']===0&&r.target.controls['0x7e0']===0)continue;
  const c=r.positionInputs,scale=f((f(c.position)*(2*Math.PI))/f(c.referenceFrequency));
  for(let i=0;i<r.target.lanes.length;i+=4){groups.push(r.target.lanes.slice(i,i+4).map(row=>f(row.frequency*scale)));nativeArgumentGroups++;}
 }
}
const run=spawnSync(oracle,[],{input:groups.map(g=>'cos4 '+g.map(x=>bits(x).toString(16)).join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:32*1024*1024});
if(run.status!==0)throw new Error(run.stderr||String(run.error));
const words=run.stdout.trim().split(/\s+/).map(s=>parseInt(s,16));if(words.length!==groups.length*4||words.some(x=>!Number.isInteger(x)))throw new Error('Incomplete cosine oracle');
let mismatches=0,nanSemantic=0,bitwise=0,mathCandidateDifferences=0,fastGroups=0,slowGroups=0;const failures=[];
for(let i=0;i<groups.length;i++){
 const g=groups[i],p=nativeVectorCos(g);if(g.every(x=>Math.abs(x)<=from(0x49742400)))fastGroups++;else slowGroups++;
 for(let j=0;j<4;j++){
  const a=words[i*4+j];
  if(Number.isNaN(from(a))&&Number.isNaN(p[j]))nanSemantic++;
  else if(bits(p[j])===a)bitwise++;
  else{mismatches++;if(failures.length<20)failures.push({group:i,lane:j,input:g.map(bits),predicted:bits(p[j]),actual:a});}
  const candidate=f(Math.cos(g[j]));if(!(Number.isNaN(candidate)&&Number.isNaN(from(a)))&&bits(candidate)!==a)mathCandidateDifferences++;
 }
}
const report={passed:!mismatches,groups:groups.length,lanes:words.length,nativeArgumentGroups,fastGroups,slowGroups,mismatches,bitwise,nanSemantic,mathCandidateDifferences,exhaustiveFloat32Testing:false,nanPayloadNotCompared:true,exceptionFlagsNotModeled:true,targetApplicationNotExecuted:true,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
