// Reproduce the global delayed route and its sum; earlier global branches remain observed.
import fs from 'node:fs';
import {createRoutedDelayCache,routeConstantBlock,readRoutedBlock} from '../dsp/routed-delay-cache.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(!data.windowComplete||data.errors.length||data.records.length!==data.ordinalLimit*4)throw new Error('Complete global output capture required');
const view=new DataView(new ArrayBuffer(4)),f=Math.fround;
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const from=x=>{view.setUint32(0,x);return view.getFloat32(0);};
let count=0,mismatches=0,cache,entries,table,wrap;
const failures=[],predictions=[];
function check(label,p,a){
 if(p.length!==a.length)throw new Error(`Shape differs ${label}`);
 for(let row=0;row<p.length;row++){
  if(p[row].length!==a[row].length)throw new Error(`Row shape differs ${label}`);
  for(let i=0;i<p[row].length;i++){
   count++;
   if(!Number.isFinite(p[row][i])||!Number.isFinite(a[row][i]))throw new Error('Nonfinite output');
   if(bits(p[row][i])!==bits(a[row][i])){
    mismatches++;if(failures.length<40)failures.push({label,row,index:i,predicted:p[row][i],actual:a[row][i]});
   }
  }
 }
}
function metadata(actual){
 if(cache.rings.length!==actual.rings.length||cache.sampleRate!==actual.sampleRate||cache.maximumDelay!==actual.maximumDelay)throw new Error('Cache layout differs');
 for(let i=0;i<cache.rings.length;i++){
  const p=cache.rings[i],a=actual.rings[i];
  if(['head','total','smallChunk','bigChunk'].some(k=>p[k]!==a[k])||p.flags.length!==a.flags.length||p.flags.some((v,j)=>v!==a.flags[j]))throw new Error('Cache state differs');
 }
}
for(let ordinal=0;ordinal<data.ordinalLimit;ordinal++){
 const stages=data.records.slice(ordinal*4,ordinal*4+4);
 if(stages.some((r,i)=>r.ordinal!==ordinal||r.stage!==['entry','route','read','sum'][i]))throw new Error('Global stage chronology differs');
 const [entry,route,read,sum]=stages;
 if(ordinal===0){
  cache=createRoutedDelayCache(route.cache);table=JSON.stringify(route.entries);wrap=route.wrap;
  entries=route.entries.map(e=>({...e,taps:Array.from({length:e.tapWords.length/6},(_,i)=>{
   const w=e.tapWords.slice(i*6,i*6+6).map(from);
   return {delay:w[0],startGain:w[1],endGain:w[2],multiplier:w[4]};
  })}));
 }
 if(JSON.stringify(route.entries)!==table||route.wrap!==wrap||route.gain!==1)throw new Error('Unverified varying global routing');
 if(route.output.samples!==64||read.output.samples!==64||route.output.rows!==2||read.output.rows!==3)throw new Error('Unverified global matrix layout');
 metadata(route.cache);
 routeConstantBlock(cache,route.output.values,entries,route.gain,!!wrap);
 const delayed=readRoutedBlock(cache);metadata(read.cache);
 check(`${ordinal}:delayed`,delayed,read.output.values);
 // The independently accumulated global branch is an explicit observed input.
 check(`${ordinal}:sumInputUnchanged`,route.sumInput.values,read.sumInput.values);
 const output=delayed.map((row,r)=>Array.from(row,(v,i)=>f(v+route.sumInput.values[r][i])));
 check(`${ordinal}:sum`,output,sum.output.values);
 predictions.push({ordinal,delayed:delayed.map(row=>[...row]),output});
}
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,blocks:data.ordinalLimit,
 cacheStateCarried:true,routingTablesStillObserved:true,globalRouteInputStillObserved:true,globalSumInputStillObserved:true,
 internalOutputRows:3,finalStereoAudioVerified:false,completeVoiceOrBrowserEquivalence:false,predictions,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,predictions:undefined,failures:undefined}));
if(!report.passed)process.exitCode=1;
