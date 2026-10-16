import fs from 'node:fs';
import {preprocessInverseReal128,inverseRealCore32} from '../dsp/real-fft-inverse.mjs';
import {buildRealCoreTwiddles32} from '../dsp/real-fft-core.mjs';
import {buildRealFinalizeCoefficients128} from '../dsp/real-fft-finalize.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: inverse-capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(!data.windowComplete||data.errors.length||data.records.length!==data.ordinalLimit*4)throw new Error('Complete inverse window required');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const twiddle=buildRealCoreTwiddles32(),e=buildRealFinalizeCoefficients128(),failures=[],predictions=[];let count=0,mismatches=0;
function check(name,p,a){if(p.length!==a.length)throw new Error('Inverse shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite inverse value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
for(let n=0;n<data.ordinalLimit;n++){
 const [entry,pre,core,returned]=data.records.slice(n*4,n*4+4);
 if([entry,pre,core,returned].some((r,i)=>r.ordinal!==n||r.stage!==['entry','preprocessed','core','returned'][i]))throw new Error('Inverse chronology differs');
 if(entry.planWords.length!==28||entry.planWords.some((v,i)=>v!==([128,16,32,3,2,4,4][i]??0)))throw new Error('Unverified inverse plan');
 check(`${n}:e`,e,entry.e);check(`${n}:twiddle`,twiddle,entry.twiddle);
 const intermediate=preprocessInverseReal128(entry.input,e),output=inverseRealCore32(intermediate,twiddle);
 check(`${n}:preprocessed`,intermediate,pre.output);check(`${n}:core`,output,core.output);check(`${n}:returned`,output,returned.output);
 predictions.push({ordinal:n,output:[...output]});
}
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,transforms:data.ordinalLimit,
 unnormalizedInverseComputed:true,coefficientsGenerated:true,inputSpectrumStillObserved:true,overlapAndNormalizationNotComputed:true,
 completeVoiceOrBrowserEquivalence:false,predictions,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,predictions:undefined,failures:undefined}));if(!report.passed)process.exitCode=1;
