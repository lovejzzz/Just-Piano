import fs from 'node:fs';
import {initializeReleaseModel} from '../dsp/release-model-controls.mjs';
const [capture,output,...extra]=process.argv.slice(2);
if(!capture||!output||extra.length)throw new Error('Usage: capture.json report.json');
const d=JSON.parse(fs.readFileSync(capture,'utf8'));
if(d.schema!==1||d.fixedSites!==true||!d.complete||d.activeSites!==0||d.errors.length||d.records.length!==10)throw new Error('Complete two-site initialization capture required');
const voices=new Set(),initialized=new Set(),view=new DataView(new ArrayBuffer(4));let count=0;const failures=[];
function bits(x){if(!Number.isFinite(x))throw new Error('Nonfinite controls');view.setFloat32(0,x);return view.getUint32(0);}
function check(name,p,a){count++;if(bits(p)!==bits(a))failures.push({name,predicted:p,actual:a});}
for(const r of d.records){
 if(r.stage==='before'){
  if(r.ordinal!==voices.size||voices.has(r.voice)||r.note!==69)throw new Error('Invalid voice chronology');voices.add(r.voice);
 }else if(r.stage==='initialize'){
  if(!voices.has(r.voice)||initialized.has(r.voice)||BigInt(r.modal)!==BigInt(r.voice)+0x168n||r.width<1||r.width>4096||r.inputs.decayRows!==0&&(r.selectedRow>=r.inputs.decayRows||r.inputs.selectedDecayRow.length!==r.width))throw new Error('Unbound initialization');
  const p=initializeReleaseModel(r.inputs);if(r.actual.polynomial.length!==5)throw new Error('Invalid polynomial target');
  p.polynomial.forEach((v,i)=>check('polynomial:'+i,v,r.actual.polynomial[i]));
  for(const k of ['rateScale','gainScale','cubicScale','cubicGainScale','timestep'])check(k,p[k],r.actual[k]);initialized.add(r.voice);
 }else throw new Error('Unknown stage');
}
if(voices.size!==5||initialized.size!==5)throw new Error('Incomplete initialization window');
const report={passed:!failures.length,count,mismatches:failures.length,voices:voices.size,selectedDecayRowMinimumComputed:true,sourceConfigurationAndDecayRowsObserved:true,targetsComparisonOnly:true,connectedToContinuousEnvelopeCapture:false,completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
