import fs from 'node:fs';
import {forwardReal128} from '../dsp/real-fft-finalize.mjs';
import {accumulatePackedRealSpectrum} from '../dsp/packed-convolution-product.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(!data.windowComplete||data.errors.length)throw new Error('Complete same-run FFT/product capture required');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
let count=0,mismatches=0,products=0,forwardTransforms=0,inverseTransforms=0,resets=0,inverseInputChecks=0;
const frequency=new Map(),pendingFft=new Map(),accumulators=new Map(),invalid=new Set(),failures=[];
let pendingProduct=null;
function check(name,p,a){if(p.length!==a.length)throw new Error('FFT/product shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite spectral value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
for(const r of data.records){
 if(r.stage==='fftEntry'){
  if(pendingFft.has(r.thread))throw new Error('Nested FFT not covered');
  if(r.direction===0)pendingFft.set(r.thread,{buffer:r.buffer,prediction:forwardReal128(r.input),direction:0});
  else if(r.direction===1){
   if(accumulators.has(r.buffer)&&!invalid.has(r.buffer)){check('inverseInput',accumulators.get(r.buffer),r.input);inverseInputChecks++;}
   invalid.add(r.buffer);frequency.delete(r.buffer);pendingFft.set(r.thread,{buffer:r.buffer,direction:1});
  }else throw new Error('Unverified FFT direction');
 }else if(r.stage==='fftReturn'){
  const p=pendingFft.get(r.thread);if(!p||p.buffer!==r.buffer||p.direction!==r.direction)throw new Error('Unpaired FFT');pendingFft.delete(r.thread);
  if(p.direction===0){check(`fft:${forwardTransforms}`,p.prediction,r.output);frequency.set(r.buffer,p.prediction);forwardTransforms++;}
  else inverseTransforms++;
 }else if(r.stage==='product'){
  if(pendingProduct||r.ordinal!==products||r.a.empty||r.b.empty||r.destination.empty)throw new Error('Unverified product chronology');
  if(r.destination.buffer===r.a.buffer||r.destination.buffer===r.b.buffer)throw new Error('Aliased convolution product not covered');
  const a=frequency.get(r.a.buffer),b=frequency.get(r.b.buffer),key=r.destination.buffer;
  if(!a||!b)throw new Error(`Computed FFT source missing at product ${products}: a=${!!a}, b=${!!b}`);
  check(`${products}:a`,a,r.a.data);check(`${products}:b`,b,r.b.data);
  if(!accumulators.has(key)||invalid.has(key)){accumulators.set(key,new Float32Array(128));invalid.delete(key);resets++;}
  const history=accumulators.get(key);check(`${products}:before`,history,r.destination.data);
  accumulatePackedRealSpectrum(a,b,history,r.scale);pendingProduct={key,ordinal:products};
 }else if(r.stage==='productReturn'){
  if(!pendingProduct||r.ordinal!==products||r.destination.buffer!==pendingProduct.key)throw new Error('Unpaired product return');
  check(`${products}:after`,accumulators.get(pendingProduct.key),r.destination.data);pendingProduct=null;products++;
 }else throw new Error('Unknown capture stage');
}
if(products!==data.productLimit||pendingProduct||pendingFft.size)throw new Error('Incomplete same-run window');
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,products,forwardTransforms,inverseTransforms,
 inverseInputChecks,accumulatorResets:resets,spectralSourcesCalculated:true,timeInputsStillObserved:true,inverseOutputNotCalculated:true,
 completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
