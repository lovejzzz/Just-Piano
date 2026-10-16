// Keep source identity, coefficient arithmetic and the falsified constant-x
// hypothesis separate. Overall failure is retained when any scope differs.
import fs from 'node:fs';
import {releaseCoefficients} from '../dsp/physical-controls.mjs';
const [capture,output,...extra]=process.argv.slice(2);
if(!capture||!output||extra.length)throw new Error('Usage: capture.json report.json');
const d=JSON.parse(fs.readFileSync(capture,'utf8'));
if(d.schema!==1||d.fixedSites!==true||d.siteCount!==2||!d.complete||d.activeSites!==0||d.errors.length||d.starts!==5||d.coefficientCount<5||d.counterLimit!==8192)throw new Error('Complete rattle coefficient window required');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite value');view.setFloat32(0,x);return view.getUint32(0);};
const scopeCounts={source:0,arithmetic:0,constantX:0},scopeMismatches={source:0,arithmetic:0,constantX:0};
const sources=new Map(),owners=new Map(),epochs=new Set(),failures=[],byEpoch={};let checks=0,mismatches=0,coefficientCount=0,activeCount=0,clampedRCount=0,cubicGainChosen=0;
function check(name,p,a,scope='constantX'){checks++;scopeCounts[scope]++;if(bits(p)!==bits(a)){mismatches++;scopeMismatches[scope]++;if(failures.length<30)failures.push({scope,name,predicted:p,actual:a});}}
for(const r of d.records){
 if(r.stage==='source'){
  const c=r.case;
  if(r.epoch!==sources.size||c.ordinal!==r.epoch||c.id!=='rattle_pedal'||![.25,.5,.75,1,0].includes(c.requested)||!Array.isArray(c.parameters)||c.parameters.length!==215)throw new Error('Unbound rattle case');
  const params=new Map(c.parameters.map(x=>[x.id,x.normalized_value]));if(params.size!==215||!params.has('rattle_pedal')||params.get('rattle_pedal')!==c.requested)throw new Error('Parameter readback differs');
  const x=Math.fround(params.get('rattle_pedal'));check('source:x',x,r.sourceX,'source');check('voice:initial-x',x,r.initialX,'source');sources.set(r.epoch,{x,voice:r.voice});owners.set(r.voice,r.epoch);
 }else if(r.stage==='coefficients'){
  const s=sources.get(r.epoch);
  if(!s||s.voice!==r.voice||owners.get(r.voice)!==r.epoch||BigInt(r.modal)!==BigInt(r.voice)+0x168n||!Number.isInteger(r.counter)||r.counter<0||r.counter>8192)throw new Error('Invalid coefficient binding');
  const c=r.inputs;if(!Number.isInteger(c.releaseFlag)||c.releaseFlag<0||c.releaseFlag>255)throw new Error('Invalid release flag');
  check('modal:x',s.x,c.x);const active=(c.releaseFlag&1)!==0||s.x>0;
  const v=active?releaseCoefficients({...c,x:s.x}):{duration:0,rate:0,gain:0};
  for(const k of ['duration','rate','gain'])check(k,v[k],r.actual[k]);
  const actualActive=(c.releaseFlag&1)!==0||Math.fround(c.x)>0;
  const arithmetic=actualActive?releaseCoefficients(c):{duration:0,rate:0,gain:0};
  for(const k of ['duration','rate','gain'])check(k,arithmetic[k],r.actual[k],'arithmetic');
  if(actualActive){activeCount++;const f=Math.fround,h=f(c.x*f(c.x*c.x)),z=f(h*f(c.cubicScale)),cap=f(1-Math.max(0,Math.min(1,z)));if(c.u>cap)clampedRCount++;if(f(h*f(c.cubicGainScale))>f(f(1-f(c.u))*f(c.gainScale)))cubicGainChosen++;}
  coefficientCount++;epochs.add(r.epoch);byEpoch[r.epoch]=(byEpoch[r.epoch]??0)+1;
 }else throw new Error('Unknown rattle record');
}
if(sources.size!==5||epochs.size!==5||coefficientCount!==d.coefficientCount||!clampedRCount||!cubicGainChosen)throw new Error('Missing source, coefficients or active cubic branch');
const report={passed:!mismatches,checks,mismatches,coefficientCount,activeCount,clampedRCount,cubicGainChosen,byEpoch,scopeCounts,scopeMismatches,sourceInitializationPassed:scopeMismatches.source===0,coefficientArithmeticPassed:scopeMismatches.arithmetic===0,constantPerVoiceXHypothesisPassed:scopeMismatches.constantX===0,initialXComputedFromOfficialParameter:true,dynamicModalXObservedForArithmetic:true,polynomialAndScalesUAndFlagsObserved:true,continuousEnvelopeOrVoiceOutputVerified:false,completeVoiceOrBrowserEquivalence:false,failures};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
