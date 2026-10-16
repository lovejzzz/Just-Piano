// Calculated voice spatial rows -> native routing table -> independent cache readback.
import fs from 'node:fs';
import {createRoutedDelayCache,routeConstantBlock,readRoutedBlock} from '../dsp/routed-delay-cache.mjs';
const [capturePath,reportPath,option,sourcePath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||option!=='--source-report'||!sourcePath||extra.length)throw new Error('Usage: capture.json report.json --source-report spatial-output.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8')),source=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
if(!data.windowComplete||data.errors.length||!source.passed||source.mismatches||!source.computedConsumerInputs)throw new Error('Complete routing capture and verified computed spatial output required');
const predictions=[],checks=[],failures=[];
const word=new DataView(new ArrayBuffer(4));
const from=x=>{word.setUint32(0,x);return word.getFloat32(0);};
const bits=x=>{word.setFloat32(0,x);return word.getUint32(0);};
function check(name,p,a){
  if(p.length!==a.length)throw new Error(`Incomplete ${name}`);
  let bad=0;
  for(let i=0;i<p.length;i++){
    if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error(`Nonfinite ${name}`);
    if(bits(p[i])!==bits(a[i])){bad++;if(failures.length<40)failures.push({name,index:i,predicted:p[i],actual:a[i]});}
  }
  checks.push({name,count:p.length,mismatches:bad});
}
const caches=new Map(),mapping=new Map(),calculated=new Map(source.predictions.map(r=>[r.ordinal,r]));
const labels=['aux','group0','group1','group2'];
let ordinal=-1,routeIndex=0,readIndex=0;
function metadata(name,state,actual){
  if(state.rings.length!==actual.rings.length||state.sampleRate!==actual.sampleRate||state.maximumDelay!==actual.maximumDelay)throw new Error(`Cache changed ${name}`);
  for(let row=0;row<state.rings.length;row++){
    const a=actual.rings[row],p=state.rings[row];
    if(p.head!==a.head||p.total!==a.total||p.smallChunk!==a.smallChunk||p.bigChunk!==a.bigChunk)throw new Error(`Cache chronology differs ${name}:${row}`);
    // Integer flag states are compared separately from the reported float count.
    if(p.flags.length!==a.flags.length||p.flags.some((v,i)=>v!==a.flags[i]))throw new Error(`Cache validity differs ${name}:${row}`);
  }
}
for(const r of data.records){
  if(r.stage==='key'){
    if(ordinal>=0&&(routeIndex!==4||readIndex!==4))throw new Error('Incomplete preceding key block');
    if(r.ordinal!==ordinal+1||r.selectionMask.some(v=>v!==1))throw new Error('Unverified key selection/chronology');
    ordinal=r.ordinal;routeIndex=0;readIndex=0;
    if(!calculated.has(ordinal))throw new Error('Calculated key input missing');
  }else if(r.stage==='route'){
    if(r.ordinal!==ordinal||r.label!==labels[routeIndex++]||readIndex)throw new Error('Reordered key routing');
    if(!caches.has(r.label)){
      if(!r.seed)throw new Error('Routing seed missing');
      caches.set(r.label,createRoutedDelayCache(r.seed));
      mapping.set(r.label,r.entries.map(entry=>({...entry,taps:Array.from({length:entry.tapWords.length/6},(_,i)=>{
        const w=entry.tapWords.slice(i*6,i*6+6).map(from);
        return {delay:w[0],startGain:w[1],endGain:w[2],multiplier:w[4]};
      })})));
    }
    const cache=caches.get(r.label);metadata(`${ordinal}:${r.label}:beforeWrite`,cache,r.cache);
    const s=calculated.get(ordinal),input=r.label==='aux'?s.auxiliary:s.groups[Number(r.label.slice(5))];
    if(r.source.values.length!==input.length)throw new Error('Routed source shape differs');
    for(let row=0;row<input.length;row++)check(`${ordinal}:${r.label}:${row}:input`,input[row],r.source.values[row]);
    const entries=mapping.get(r.label);
    if(entries.length!==r.entries.length||entries.some((e,i)=>e.source!==r.entries[i].source||e.destination!==r.entries[i].destination||e.tapWords.some((v,j)=>v!==r.entries[i].tapWords[j])))throw new Error('Routing table changed');
    if(r.gain!==1)throw new Error('Nonunit outer routing level not covered');
    routeConstantBlock(cache,input,entries,r.gain,!!r.wrap);
  }else if(r.stage==='read'){
    if(r.ordinal!==ordinal||r.label!==labels[readIndex++]||routeIndex!==4)throw new Error('Reordered key cache read');
    const cache=caches.get(r.label);metadata(`${ordinal}:${r.label}:beforeRead`,cache,r.beforeCache);
    if(r.before.values.length!==cache.rings.length||r.before.values.some(row=>row.some(v=>v!==0)))throw new Error('Destination already contains uncomputed input');
    const output=readRoutedBlock(cache);
    if(output.length!==r.after.values.length)throw new Error('Cache output shape changed');
    for(let row=0;row<output.length;row++)check(`${ordinal}:${r.label}:${row}:readback`,output[row],r.after.values[row]);
    metadata(`${ordinal}:${r.label}:afterRead`,cache,r.afterCache);
    predictions.push({ordinal,label:r.label,output:output.map(row=>[...row])});
  }else throw new Error('Unexpected key routing stage');
}
if(ordinal+1!==data.ordinalLimit||routeIndex!==4||readIndex!==4||calculated.size!==data.ordinalLimit)throw new Error('Incomplete routing window');
const count=checks.reduce((n,c)=>n+c.count,0),mismatches=checks.reduce((n,c)=>n+c.mismatches,0);
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,blocks:data.ordinalLimit,
  computedSpatialInputs:true,cachesStartLogicallyEmpty:true,cacheStateCarried:true,routingTablesStillObserved:true,
  destinationInitialValuesRequiredZero:true,upstreamFromSeparateVerifiedRun:true,finalStereoAudioVerified:false,
  completeVoiceOrBrowserEquivalence:false,predictions,checks,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,predictions:undefined,checks:undefined,failures:undefined}));
if(!report.passed)process.exitCode=1;
