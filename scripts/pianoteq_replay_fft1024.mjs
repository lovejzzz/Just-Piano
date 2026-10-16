import fs from 'node:fs';
import {forwardReal1024Stages} from '../dsp/real-fft-1024.mjs';
import {buildReal1024Coefficients} from '../dsp/real-fft-coefficients.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: fft1024-capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(!data.windowComplete||data.errors.length||data.transformLimit!==128||data.records.length!==384)throw new Error('Complete 128-transform runtime window required');
const {e,twiddle,usedTwiddle}=buildReal1024Coefficients(),view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
let count=0,mismatches=0,unusedLocationsWithNonzeroBits=0;const failures=[];
function check(name,p,a){if(p.length!==a.length)throw new Error('FFT1024 shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite FFT1024 value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
for(const plan of Object.values(data.plans)){
 const expected=[1024,128,256,4,4,4,4,4];
 if(plan.words.length!==28||plan.words.some((x,i)=>x!==(expected[i]??0))||plan.twiddleBits.length!==256)throw new Error('Unverified real FFT1024 plan');
 check('coefficients:e',e,plan.e);
 for(let i=0;i<256;i++){
  if(!usedTwiddle[i]){if(plan.twiddleBits[i]!==0)unusedLocationsWithNonzeroBits++;continue;}
  view.setUint32(0,plan.twiddleBits[i]);check('coefficients:twiddle',[twiddle[i]],[view.getFloat32(0)]);
 }
}
const workerTimes=[];
for(let n=0;n<128;n++){
 const [entry,core,returned]=data.records.slice(n*3,n*3+3);
 if([entry,core,returned].some((r,i)=>r.ordinal!==n||r.stage!==['entry','core','returned'][i]||r.thread!==entry.thread)||!data.plans[entry.plan])throw new Error('FFT1024 chronology differs');
 check(`${n}:zeroPadding`,new Float32Array(512),entry.input.slice(512));
 const computed=forwardReal1024Stages(entry.input);
 check(`${n}:core`,computed.core,core.output);check(`${n}:spectrum`,computed.output,returned.output);workerTimes.push(entry.worker.time);
}
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,transforms:128,planCount:Object.keys(data.plans).length,
 firstWorkerInputFrame:Math.min(...workerTimes),lastWorkerInputFrame:Math.max(...workerTimes),unusedLocationsWithNonzeroBits,
 completeForwardFft1024Computed:true,coefficientsGenerated:true,inputTimeSamplesObserved:true,inverseAndWorkerConvolutionNotComputed:true,
 completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
