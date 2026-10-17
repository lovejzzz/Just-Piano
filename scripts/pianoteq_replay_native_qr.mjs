import fs from 'node:fs';import crypto from 'node:crypto';
import {solveNativeQuadratic} from '../dsp/native-small-eigen.mjs';
import {solveNativeCubic,nativeQrTolerance} from '../dsp/native-cubic-qr.mjs';
import {rootsToFrequencyDecay} from '../dsp/modal-poles.mjs';
const [input,output]=process.argv.slice(2);if(!output)throw new Error('Original complete root capture and NEW report required');
const bytes=fs.readFileSync(input),d=JSON.parse(bytes);
if(d.errors?.length||d.records?.length!==32||d.records.filter(r=>r.N===2).length!==14||d.records.filter(r=>r.N===3).length!==18)throw new Error('Complete original 32 records required');
const view=new DataView(new ArrayBuffer(8)),bits=(x,float=false)=>{if(float){view.setFloat32(0,x);return view.getUint32(0).toString(16);}view.setFloat64(0,x);return view.getBigUint64(0).toString(16);};
const checks=[],failures=[],iterations=[];let doubleValues=0,float32Values=0,indices=0;
const compare=(name,a,b,float=false)=>{if(a.length!==b.length)throw new Error('Incomplete '+name);let mismatches=0;for(let i=0;i<a.length;i++)if(bits(a[i],float)!==bits(b[i],float)){mismatches++;failures.push({name,index:i,predicted:a[i],actual:b[i]});}checks.push({name,values:a.length,mismatches});if(float)float32Values+=a.length;else doubleValues+=a.length;};
for(const [i,row] of d.records.entries()){
 const own=row.N===2?solveNativeQuadratic(row.coefficients,{tolerance:nativeQrTolerance}):solveNativeCubic(row.coefficients);
 const pole=rootsToFrequencyDecay(own.roots,row.center,row.floor_ratio);
 iterations.push({record:i,degree:row.N,steps:own.steps?.length??0,blocks:own.blocks});
 compare('roots:'+i,own.roots,row.roots);compare('frequency:'+i,pole.frequency,row.frequency,true);compare('decay:'+i,pole.decay,row.decay,true);
 if(pole.order.length!==row.sort_indices.length)throw new Error('Incomplete sort indices');
 for(let j=0;j<pole.order.length;j++){indices++;if(pole.order[j]!==row.sort_indices[j])failures.push({name:'sort:'+i,index:j,predicted:pole.order[j],actual:row.sort_indices[j]});}
}
const report={passed:!failures.length,records:32,quadraticRecords:14,cubicRecords:18,doubleValues,float32Values,indices,iterations,checks,failures,tolerance:nativeQrTolerance,toleranceSupplierVerified:true,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),rootAlgorithm:'recovered-native-finite-n2-n3',generalQrVerified:false,newAudioRendered:false,completeVoiceVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,checks:undefined,iterations:undefined}));if(!report.passed)process.exitCode=1;
