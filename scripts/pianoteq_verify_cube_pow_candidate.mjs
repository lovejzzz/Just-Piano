// Test the explicit cube candidate without substituting a multiply chain.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const [oracle,reportPath,replayPath,...extra]=process.argv.slice(2);
if(!oracle||!reportPath||extra.length)throw new Error('Usage: cube-oracle report.json [merged-replay.json]');
const view=new DataView(new ArrayBuffer(8));
const floatWord=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const words=new Set([0,0x80000000,1,0x80000001,0x7f7fffff,0xff7fffff,0x7f800000,0xff800000,0x7fc00000]);
for(let i=0;i<=127;i++)for(const scale of [1,1.3])words.add(floatWord(Math.fround(i/127*scale)));
let seed=7;
for(let i=0;i<100000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;words.add(seed);}
let observedCalls=0;
if(replayPath){
 const d=JSON.parse(fs.readFileSync(replayPath,'utf8'));
 if(!d.passed||!d.doublePowCandidateUsed||!d.powCalls?.length)throw new Error('Passing merged replay with explicit pow candidate required');
 for(const c of d.powCalls){if(!Number.isFinite(c.input)||Math.fround(c.input)!==c.input||c.exponent!==3)throw new Error('Observed cube contract differs');words.add(floatWord(c.input));observedCalls++;}
}
const inputs=[...words],run=spawnSync(oracle,[],{input:inputs.map(w=>w.toString(16)).join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024});
if(run.status!==0)throw new Error(run.stderr||String(run.error)||'Cube oracle failed');
const outputs=run.stdout.trim().split(/\s+/);
if(outputs.length!==inputs.length||outputs.some(s=>!/^[0-9a-f]{16}$/.test(s)))throw new Error('Incomplete double oracle output');
let mismatches=0,directCubeDifferences=0,nanSemantic=0;const failures=[],directFailures=[];
for(let i=0;i<inputs.length;i++){
 view.setUint32(0,inputs[i]);const x=view.getFloat32(0);const word=BigInt('0x'+outputs[i]);view.setBigUint64(0,word);const actual=view.getFloat64(0);
 const candidate=Math.pow(x,3),direct=(x*x)*x;
 if(Number.isNaN(actual)&&Number.isNaN(candidate)&&Number.isNaN(direct)){nanSemantic++;continue;}
 view.setFloat64(0,candidate);if(view.getBigUint64(0)!==word){mismatches++;if(failures.length<10)failures.push({input:inputs[i],candidate,actual});}
 view.setFloat64(0,direct);if(view.getBigUint64(0)!==word){directCubeDifferences++;if(directFailures.length<5)directFailures.push({input:inputs[i],direct,actual});}
}
const report={passed:!mismatches,count:inputs.length,observedCalls,mismatches,nanSemantic,directCubeDifferences,nativeDoublePowRecovered:false,onlyFloat32BaseExponentThreeTested:true,nanPayloadNotCompared:true,failures,directFailures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
