// System math only: default IEEE log / log2f, plus prior replay's actual math inputs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {nativeDoubleLog} from '../dsp/native-double-log.mjs';
import {nativeScalarLog2f} from '../dsp/native-scalar-log2.mjs';
const [priorPath,oracle,operation,directory,...extra]=process.argv.slice(2);
if(!directory||extra.length||!['log','log2f'].includes(operation))throw new Error('Usage: prior-impedance.json system-log-oracle log|log2f new-directory');
const prior=JSON.parse(fs.readFileSync(priorPath)),recorded=prior.oracleCalls?.filter(c=>c.operation===operation);if(!prior.passed||!recorded?.length)throw new Error('Prior complete math calls required');fs.mkdirSync(directory);
const v=new DataView(new ArrayBuffer(8)),v32=new DataView(new ArrayBuffer(4)),word=x=>{v.setFloat64(0,x);return v.getBigUint64(0);},number=w=>{v.setBigUint64(0,w);return v.getFloat64(0);},hex=x=>word(x).toString(16).padStart(16,'0'),float=w=>{v32.setUint32(0,w>>>0);return v32.getFloat32(0);};
const cases=[],addWord=(label,w,saved)=>cases.push({label,input:BigInt.asUintN(64,w).toString(16).padStart(16,'0'),saved}),add=(label,x)=>addWord(label,word(x));
for(const c of recorded){if(c.inputs.length!==1||c.outputs.length!==1)throw new Error('One-input math calls required');addWord('recorded-call',BigInt('0x'+c.inputs[0]),c.outputs[0]);}
let seed=125;const randomWord=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;},random=()=>randomWord()/2**32;
for(let i=0;i<20000;i++)add('audio-range',.000001+random()*1.999999);
for(let i=0;i<20000;i++){if(operation==='log'){const w=(BigInt(randomWord())<<32n)|BigInt(randomWord());addWord('positive-IEEE',w&0x7fffffffffffffffn);}else{let w=randomWord()&0x7fffffff;if(w>=0x7f800000)w&=0x7f7fffff;add('positive-float32',float(w));}}
for(let i=0;i<10000;i++){if(operation==='log'){const w=((BigInt(randomWord()&0xfffff)<<32n)|BigInt(randomWord()))||1n;addWord('subnormal-input',w);}else add('subnormal-input',float(1+randomWord()%0x7fffff));}
for(let i=0;i<20000;i++)addWord('random-IEEE',(BigInt(randomWord())<<32n)|BigInt(randomWord()));
for(let i=-4096;i<=4096;i++){if(operation==='log')addWord('near-one',0x3ff0000000000000n+BigInt(i));else add('near-one',float(0x3f800000+i));}
if(operation==='log')for(const e of [-1000,-100,-1,0,1,100,1000])for(let j=0;j<128;j++){const w=word((1+(j+.5)/128)*2**e);for(let step=-2;step<=2;step++)addWord('table-boundary',w+BigInt(step));}
else for(const e of [1,2,64,126,127,128,200,254])for(let j=0;j<64;j++)for(let step=-1;step<=1;step++)add('table-boundary',float((e<<23)+j*0x20000-0x10000+step));
for(const w of [0n,0x8000000000000000n,1n,0x8000000000000001n,0x000fffffffffffffn,0x800fffffffffffffn,0x0010000000000000n,0x8010000000000000n,0x3ff0000000000000n,0xbff0000000000000n,0x7fefffffffffffffn,0xffefffffffffffffn,0x7ff0000000000000n,0xfff0000000000000n,0x7ff8000000000001n,0xfff8000000000001n,0x7ff0000000000001n])addWord('special',w);
const input=cases.map(c=>c.input).join('\n')+'\n';fs.writeFileSync(path.join(directory,'inputs.json'),JSON.stringify({seed:125,operation,cases},null,2)+'\n',{flag:'wx'});const run=spawnSync(oracle,[operation],{input,encoding:'utf8',maxBuffer:8*1024*1024});if(run.error||run.signal||run.status!==0)throw new Error('System log oracle failed');
const targets=run.stdout.trim().split(/\s+/);if(targets.length!==cases.length||targets.some(x=>!(/^[0-9a-f]{16}$/).test(x)))throw new Error('Complete result words required');fs.writeFileSync(path.join(directory,'system-results.txt'),run.stdout,{flag:'wx'});
let mismatches=0,nanChecks=0,savedCallMismatches=0,mathCandidateMismatches=0;const groups={},failures=[];
for(let i=0;i<cases.length;i++){const c=cases[i],x=number(BigInt('0x'+c.input)),actual=number(BigInt('0x'+targets[i])),predicted=operation==='log'?nativeDoubleLog(x):nativeScalarLog2f(x),bad=Number.isNaN(actual)?!Number.isNaN(predicted):hex(predicted)!==targets[i];if(Number.isNaN(actual))nanChecks++;else{const alternative=operation==='log'?Math.log(x):Math.fround(Math.log2(Math.fround(x)));if(hex(alternative)!==targets[i])mathCandidateMismatches++;}if(c.saved&&c.saved!==targets[i])savedCallMismatches++;
 const group=groups[c.label]??={checks:0,mismatches:0};group.checks++;if(bad){mismatches++;group.mismatches++;if(failures.length<40)failures.push({...c,target:targets[i],predicted:hex(predicted)});}}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),report={passed:!mismatches&&!savedCallMismatches,operation,checks:cases.length,mismatches,nanSemanticChecks:nanChecks,nanPayloadBitsNotClaimed:true,mathCandidateMismatches,savedCallMismatches,groups,failures,inputSha256:sha(Buffer.from(input)),outputSha256:sha(Buffer.from(run.stdout)),oracleSha256:sha(fs.readFileSync(oracle)),rawIeeeInputsPreserved:true,systemMathOnly:true,newNativePianoCapture:false};fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
