import fs from 'node:fs';
import {buildReal1024Coefficients} from '../dsp/real-fft-coefficients.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: worker-capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(!data.windowComplete||data.errors.length||Object.keys(data.plans).length!==1)throw new Error('One complete worker plan required');
const plan=Object.values(data.plans)[0],expected=[1024,128,256,4,4,4,4,4];
if(plan.planWords.length!==28||plan.planWords.some((v,i)=>v!==(expected[i]??0)))throw new Error('Unverified FFT1024 factorization');
if(plan.e.length!==768||plan.twiddle.length!==256)throw new Error('Coefficient shape differs');
const {e,twiddle,usedTwiddle}=buildReal1024Coefficients(),view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};let count=0,mismatches=0;const failures=[];
for(const [name,p,a,mask] of [['e',e,plan.e,null],['twiddle',twiddle,plan.twiddle,usedTwiddle]])for(let i=0;i<p.length;i++){
 if(mask&&!mask[i])continue;
 count++;if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}
}
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,usedTwiddleValues:[...usedTwiddle].reduce((a,b)=>a+b,0),
 unusedTwiddleLocations:usedTwiddle.length-[...usedTwiddle].reduce((a,b)=>a+b,0),finalizationValues:e.length,
 unusedLocationsExcludedByStageReadIndices:true,fullFftNotComputed:true,completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
