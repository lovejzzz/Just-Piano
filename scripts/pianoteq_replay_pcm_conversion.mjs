import fs from 'node:fs';
import {nativePcmSigned32} from '../dsp/pcm24.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: runtime.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(!data.windowComplete||data.errors.length||data.records.length!==data.ordinalLimit*2)throw new Error('Complete PCM conversion capture required');
let count=0,mismatches=0;const failures=[];
for(let n=0;n<data.ordinalLimit;n++){
 const [input,converted]=data.records.slice(n*2,n*2+2);
 if(input.stage!=='input'||converted.stage!=='converted'||input.ordinal!==n||converted.ordinal!==n||input.input.length!==input.channels||converted.signed32.length!==input.channels)throw new Error('PCM capture chronology/shape differs');
 for(let row=0;row<input.channels;row++){
  if(input.input[row].length!==input.samples||converted.signed32[row].length!==input.samples)throw new Error('PCM row incomplete');
  for(let i=0;i<input.samples;i++){
   const predicted=nativePcmSigned32(input.input[row][i]),actual=converted.signed32[row][i];count++;
   if(predicted!==actual){mismatches++;if(failures.length<30)failures.push({ordinal:n,row,index:i,predicted,actual});}
  }
 }
}
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,blocks:data.ordinalLimit,
 nativeWriterInstructionExecuted:true,inputStillObserved:true,completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
