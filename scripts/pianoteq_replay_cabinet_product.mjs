import fs from 'node:fs';
import {accumulatePackedRealSpectrum} from '../dsp/packed-convolution-product.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(!data.windowComplete||data.errors.length||data.records.length!==data.ordinalLimit*3)throw new Error('Complete convolution product capture required');
const word=new DataView(new ArrayBuffer(4)),bits=x=>{word.setFloat32(0,x);return word.getUint32(0);};
let count=0,mismatches=0,resets=0;const failures=[],histories=new Map();
function check(name,p,a){if(p.length!==a.length)throw new Error('Packed shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite packed value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
for(let n=0;n<data.ordinalLimit;n++){
 const [clear,multiply,returned]=data.records.slice(n*3,n*3+3);
 if([clear,multiply,returned].some((r,i)=>r.ordinal!==n||r.stage!==['clear','multiply','returned'][i]))throw new Error('Packed chronology differs');
 const c=clear.destination,d=multiply.destination,a=multiply.a,b=multiply.b;
 if(c.root!==d.root||returned.destination.root!==d.root||a.root===d.root||b.root===d.root||d.bins!==64||d.data.length!==128||multiply.function!=='0x10096b050'||a.empty||b.empty||d.empty||returned.destination.empty)throw new Error('Unverified spectral product state');
 if(!multiply.plan||multiply.plan.vectorCount!==16||multiply.plan.complexTransform!==0)throw new Error('Unverified FFT packing');
 if(!histories.has(d.root)){
  if(!c.empty&&c.data.some(v=>v!==0))throw new Error('Initial nonempty accumulator history missing');
  histories.set(d.root,new Float32Array(128));
 }
 const history=histories.get(d.root);
 if(c.empty){history.fill(0);resets++;}
 check(`${n}:before`,history,d.data);
 accumulatePackedRealSpectrum(a.data,b.data,history,multiply.scale);
 check(`${n}:after`,history,returned.destination.data);
}
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,products:data.ordinalLimit,
 independentlyCarriedAccumulators:histories.size,nativeLazyClears:resets,planVerified:true,fftInputsStillObserved:true,impulseSpectraStillObserved:true,
 forwardAndInverseFftNotReproduced:true,completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
