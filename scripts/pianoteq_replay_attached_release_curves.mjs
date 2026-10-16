// Compute the three release fields from their observed full-model curves.
import fs from 'node:fs';
import {linearModelCurve} from '../dsp/model-curves.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: attached-runtime.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(data.schema!==1||data.errors?.length!==0||data.activeSites!==0||data.rows?.length!==105||Object.keys(data.sources??{}).length!==1)throw new Error('Complete, inactive 105-key attached capture required');
const fields=['baseTime','maximumTime','amplitudeScale'];
const addr=s=>{if(typeof s!=='string'||!/^0x[0-9a-f]+$/.test(s))throw new Error('Invalid address');return BigInt(s);};
const view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite control');view.setFloat32(0,x);return view.getUint32(0);};
const first=data.rows[0],sources=Object.entries(data.sources),[id,source]=sources[0];
if(source.interface!==id||source.caller!=='0x1003d2a70'||source.getter!=='0x1001f0188'||JSON.stringify(source.getterWords)!==JSON.stringify([0xf9408c00,0xd65f03c0])||source.baseOffset!==0x118)throw new Error('Unverified caller or model accessor');
for(const [field,offset] of [['baseTime',0x3c28n],['maximumTime',0x3c78n],['amplitudeScale',0x3cc8n]]){
 const curve=source.curves?.[field];
 if(!curve||curve.dimension!==1||curve.log_x!==0||curve.special_mode!==0||addr(curve.object)!==addr(source.baseObject)+offset||(curve.x.length?curve.x.length!==curve.y.length:curve.y.length!==1))throw new Error('Unverified scalar runtime curve mode or address');
}
let count=0,mismatches=0,interiorKeys=0;const failures=[];
for(let i=0;i<105;i++){
 const row=data.rows[i];
 if(row.index!==i||row.storedIndex!==i+9||row.thread!==first.thread||row.releaseSource!==id||row.packedOwner!==first.packedOwner||addr(row.source)!==addr(first.source)+BigInt(i)*0x38n||addr(row.destination)!==addr(first.destination)+BigInt(i)*0x140n)throw new Error('Packed/runtime table identity differs');
 for(const field of fields){
  const curve=source.curves[field],result=linearModelCurve(curve,row.storedIndex,{runtimeMode:'linear-clamp'});
  if(result.length!==1)throw new Error('Scalar model curve required');
  if(field==='baseTime'&&curve.x.length>1&&row.storedIndex>curve.x[0]&&row.storedIndex<curve.x.at(-1))interiorKeys++;
  // Both source and target are comparison-only. Interpolation uses no packed
  // value or runtime control, and performs the native direct-division/FMA order.
  for(const target of ['sourceControls','targetControls']){
   count++;if(bits(result[0])!==bits(row[target][field])){mismatches++;if(failures.length<30)failures.push({index:i,field,target,predicted:result[0],actual:row[target][field]});}
  }
 }
}
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,rows:105,fields:3,interiorKeys,
 sourceCurvesObserved:true,runtimeModeObserved:true,curveInterpolationComputed:true,packedAndRuntimeControlsComparisonOnly:true,
 constantEndpointCurves:Object.values(source.curves).every(c=>c.y.every(y=>bits(y)===bits(c.y[0]))),
 nonconstantReleaseCurveNotValidated:true,actualEventAndAudioBlocksNotCaptured:true,completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
