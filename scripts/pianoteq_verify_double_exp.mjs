// Independent system exp(double) comparisons, including the application's recorded math inputs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {nativeDoubleExp} from '../dsp/native-double-exp.mjs';
const [priorPath,oracle,directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw new Error('Usage: prior-impedance-report.json system-exp-oracle new-directory');fs.mkdirSync(directory);
const prior=JSON.parse(fs.readFileSync(priorPath));if(!prior.passed||!prior.oracleCalls?.length)throw new Error('Complete prior native-math comparison required');
const v=new DataView(new ArrayBuffer(8)),word=x=>{v.setFloat64(0,x);return v.getBigUint64(0);},number=w=>{v.setBigUint64(0,BigInt.asUintN(64,w));return v.getFloat64(0);},hex=x=>word(x).toString(16).padStart(16,'0');
const cases=[],addWord=(label,w,saved)=>cases.push({label,input:BigInt.asUintN(64,w).toString(16).padStart(16,'0'),saved}),add=(label,x,saved)=>addWord(label,word(x),saved);
for(const row of prior.oracleCalls.filter(r=>r.operation==='exp')){if(row.inputs.length!==1||row.outputs.length!==1)throw new Error('One-input exponential calls required');addWord('recorded-call',BigInt('0x'+row.inputs[0]),row.outputs[0]);}
for(const denominator of [5185,48000,48001])add('time-envelope',-.9942522733438669/denominator);
let seed=124;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2**32;};
for(let i=0;i<20000;i++)add('audio-range',-100+random()*120);
for(let i=0;i<20000;i++)add('normal-range',-708+random()*1417.7);
for(let i=0;i<10000;i++)add('subnormal-result',-745.25+random()*37);
for(let i=0;i<30000;i++){const high=BigInt(Math.floor(random()*2**32)),low=BigInt(Math.floor(random()*2**32));addWord('random-IEEE',(high<<32n)|low);}
const scale=number(0x40671547652b82fen);
for(let i=0;i<2000;i++){const n=Math.floor(random()*260000)-137000;const x=n/scale,w=word(x);for(let step=-2;step<=2;step++)addWord('reduction-boundary',w+BigInt(step));}
for(const x of [number(0x40862e42fefa39f0n),number(0xc0874a0000000000n),-708.3964185322641]){const w=word(x);for(let step=-64;step<=64;step++)addWord('range-boundary',w+BigInt(step));}
for(const w of [0n,0x8000000000000000n,1n,0x8000000000000001n,0x000fffffffffffffn,0x800fffffffffffffn,0x0010000000000000n,0x8010000000000000n,0x7fefffffffffffffn,0xffefffffffffffffn,0x7ff0000000000000n,0xfff0000000000000n,0x7ff8000000000001n,0xfff8000000000001n,0x7ff0000000000001n])addWord('special',w);
const input=cases.map(c=>c.input).join('\n')+'\n';fs.writeFileSync(path.join(directory,'inputs.json'),JSON.stringify({seed:124,cases},null,2)+'\n',{flag:'wx'});
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:8*1024*1024});if(run.error||run.signal||run.status!==0)throw new Error('Independent system oracle failed: '+(run.error?.message??run.stderr));
const targets=run.stdout.trim().split(/\s+/);if(targets.length!==cases.length||targets.some(x=>!(/^[0-9a-f]{16}$/).test(x)))throw new Error('Complete exp result words required');fs.writeFileSync(path.join(directory,'system-results.txt'),run.stdout,{flag:'wx'});
let mismatches=0,mathExpMismatches=0,nanChecks=0,savedCallMismatches=0;const failures=[],groups={};
for(let i=0;i<cases.length;i++){const c=cases[i],x=number(BigInt('0x'+c.input)),actual=number(BigInt('0x'+targets[i])),predicted=nativeDoubleExp(x);const mismatch=Number.isNaN(actual)?!Number.isNaN(predicted):hex(predicted)!==targets[i];if(Number.isNaN(actual))nanChecks++;else if(hex(Math.exp(x))!==targets[i])mathExpMismatches++;
 if(c.saved&&c.saved!==targets[i])savedCallMismatches++;
 const group=groups[c.label]??={checks:0,mismatches:0};group.checks++;if(mismatch){mismatches++;group.mismatches++;if(failures.length<40)failures.push({...c,target:targets[i],predicted:hex(predicted)});}}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');const report={passed:!mismatches&&!savedCallMismatches,checks:cases.length,mismatches,nanSemanticChecks:nanChecks,nanPayloadBitsNotClaimed:true,mathExpMismatches,savedCallMismatches,groups,failures,inputSha256:sha(Buffer.from(input)),outputSha256:sha(Buffer.from(run.stdout)),oracleSha256:sha(fs.readFileSync(oracle)),rawIeeeInputsPreserved:true,systemMathOnly:true,newNativePianoCapture:false};fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
