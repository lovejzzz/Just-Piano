// Verified global output boundary -> observed post-processing -> calculated stereo routing.
import fs from 'node:fs';
import {createRoutedDelayCache,routeConstantBlock,readRoutedBlock} from '../dsp/routed-delay-cache.mjs';
const [capturePath,reportPath,option,upstreamPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||option!=='--global-report'||!upstreamPath||extra.length)throw new Error('Usage: capture.json report.json --global-report calculated-global-output.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8')),upstream=JSON.parse(fs.readFileSync(upstreamPath,'utf8'));
if(!data.windowComplete||data.errors.length||data.records.length!==data.ordinalLimit*4||!upstream.passed||upstream.mismatches||upstream.blocks!==data.ordinalLimit)throw new Error('Complete verified captures required');
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const from=x=>{view.setUint32(0,x);return view.getFloat32(0);};
let cache,entries,table,wrap,count=0,mismatches=0;
const failures=[],predictions=[];
function check(name,p,a){
 if(p.length!==a.length)throw new Error(`Shape differs ${name}`);
 for(let row=0;row<p.length;row++){
  if(p[row].length!==a[row].length)throw new Error(`Row shape differs ${name}`);
  for(let i=0;i<p[row].length;i++){
   count++;
   if(!Number.isFinite(p[row][i])||!Number.isFinite(a[row][i]))throw new Error('Nonfinite output');
   if(bits(p[row][i])!==bits(a[row][i])){
    mismatches++;if(failures.length<40)failures.push({name,row,index:i,predicted:p[row][i],actual:a[row][i]});
   }
  }
 }
}
function metadata(actual){
 if(cache.sampleRate!==actual.sampleRate||cache.maximumDelay!==actual.maximumDelay||cache.rings.length!==actual.rings.length)throw new Error('Cache layout differs');
 for(let row=0;row<cache.rings.length;row++){
  const p=cache.rings[row],a=actual.rings[row];
  if(['head','total','smallChunk','bigChunk'].some(k=>p[k]!==a[k])||p.flags.length!==a.flags.length||p.flags.some((v,i)=>v!==a.flags[i]))throw new Error('Cache state differs');
 }
}
for(let ordinal=0;ordinal<data.ordinalLimit;ordinal++){
 const stages=data.records.slice(ordinal*4,ordinal*4+4);
 if(stages.some((r,i)=>r.ordinal!==ordinal||r.stage!==['global','preFilter','route','returned'][i]))throw new Error('Output chronology differs');
 const [global,preFilter,route,returned]=stages;
 if(upstream.predictions[ordinal].ordinal!==ordinal)throw new Error('Upstream chronology differs');
 check(`${ordinal}:global`,upstream.predictions[ordinal].output,global.output.values);
 if(route.output.rows!==3||route.output.samples!==64||route.source.rows!==8||route.source.samples!==64||returned.destination.rows!==2||returned.destination.samples!==64)throw new Error('Unverified output matrix layout');
 if(!ordinal){
  cache=createRoutedDelayCache(route.cache);table=JSON.stringify(route.entries);wrap=route.wrap;
  entries=route.entries.map(e=>({...e,taps:Array.from({length:e.tapWords.length/6},(_,i)=>{
   const w=e.tapWords.slice(i*6,i*6+6).map(from);
   return {delay:w[0],startGain:w[1],endGain:w[2],multiplier:w[4]};
  })}));
 }
 if(route.gain!==1||JSON.stringify(route.entries)!==table||route.wrap!==wrap)throw new Error('Unverified variable output routing');
 const source=[...route.output.values,...Array.from({length:5},()=>new Float32Array(64))];
 check(`${ordinal}:source`,source,route.source.values);
 metadata(route.cache);routeConstantBlock(cache,source,entries,route.gain,!!wrap);
 const stereo=readRoutedBlock(cache);metadata(returned.cache);
 check(`${ordinal}:stereo`,stereo,returned.destination.values);
 check(`${ordinal}:internalUnchanged`,route.output.values,returned.output.values);
 predictions.push({ordinal,stereo:stereo.map(row=>[...row])});
}
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,blocks:data.ordinalLimit,
 computedGlobalBoundary:true,postProcessingInputStillObserved:true,routingTablesStillObserved:true,cacheStateCarried:true,
 stereoRoutingNumericallyVerified:true,finalWavGenerated:false,completeVoiceOrBrowserEquivalence:false,predictions,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,predictions:undefined,failures:undefined}));
if(!report.passed)process.exitCode=1;
