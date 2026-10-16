import fs from 'node:fs';
import {forwardRealCore32,buildRealCoreTwiddles32} from '../dsp/real-fft-core.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
const hasCoreObservation=data.records.length===data.ordinalLimit*4,stride=hasCoreObservation?4:3;
if(!data.windowComplete||data.errors.length||(!hasCoreObservation&&(!data.runtimeOnly||data.records.length!==data.ordinalLimit*3)))throw new Error('Complete forward FFT capture required');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
let count=0,mismatches=0;const failures=[],predictions=[],twiddle=buildRealCoreTwiddles32();
function check(name,p,a){if(p.length!==a.length)throw new Error('FFT shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite FFT value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
for(let n=0;n<data.ordinalLimit;n++){
 const stages=data.records.slice(n*stride,(n+1)*stride);
 const entry=stages[0],core=hasCoreObservation?stages[1]:null,coreReturn=stages[hasCoreObservation?2:1];
 if(stages.some((r,i)=>r.ordinal!==n||r.stage!==(hasCoreObservation?['entry','core','coreReturn','returned']:['entry','coreReturn','returned'])[i]))throw new Error('FFT chronology differs');
 if(entry.n!==128||entry.nc!==16||entry.direction!==0||entry.ordered!==0||entry.planWords[27]!==0||entry.planWords.slice(2,27).some((v,i)=>v!==([32,3,2,4,4][i]??0))||(core&&(core.n!==32||core.factors.length!==25||core.factors.some((v,i)=>v!==([32,3,2,4,4][i]??0)))))throw new Error('Unverified real FFT plan');
 if(core)check(`${n}:inputCopy`,entry.input,core.input);check(`${n}:twiddle`,twiddle,core?core.twiddle:entry.twiddle);
 const output=forwardRealCore32(entry.input,twiddle);check(`${n}:core`,output,coreReturn.output);
 predictions.push({ordinal:n,output:[...output]});
}
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,transforms:data.ordinalLimit,runtimeOnly:!!data.runtimeOnly,
 factors:[2,4,4],twiddlesGenerated:true,twiddleSetupCallPathRecovered:false,finalRealFftPackingNotComputed:true,inverseFftNotComputed:true,
 completeVoiceOrBrowserEquivalence:false,predictions,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,predictions:undefined,failures:undefined}));if(!report.passed)process.exitCode=1;
