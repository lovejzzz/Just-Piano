import fs from 'node:fs';
import {GlobalRoutedMix64} from '../dsp/global-routed-mix.mjs';
import {CabinetConvolution64} from '../dsp/cabinet-convolution.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(data.schema!==1||!data.globalRouteBoundary||!data.windowComplete||data.errors.length||data.minimumWrapperBlocks!==400||data.wrapperBlocks!==400||data.wrapperLocalFrames!==25600)throw new Error('Complete 400-block cabinet window required');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const failures=[];let count=0,scalarCount=0,mismatches=0,blocks=0,context=null,routed=null,headProducts=0,tailProducts=0,headNonemptyOutputs=0,tailNonemptyOutputs=0,kernelSpectra=0,activeRowGateBlocks=0;
function floats(name,p,a){if(p?.length!==a?.length)throw new Error('Cabinet array shape differs');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite cabinet value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
function scalar(name,p,a){scalarCount++;if(p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
const entries=Object.entries(data.configs);if(entries.length!==1)throw new Error('One cabinet configuration required');
const [state,c]=entries[0],model=new CabinetConvolution64(c.head.configuration,c.tail.configuration);
for(const [name,bank] of [['head',model.head],['tail',model.tail.model]]){
 const config=c[name].configuration;
 if(config.inputs.length!==9||config.kernels.length!==9||config.outputs.length!==3||config.routes.length!==9)throw new Error('Unverified cabinet bank shape');
 for(let row=0;row<9;row++)for(let slot=0;slot<config.kernels[row].slots.length;slot++){
  const native=config.kernels[row].slots[slot];if(!native.empty){floats(`${name}:kernel`,bank.kernels[row].slots[slot].data,native.data);kernelSpectra++;}
 }
}
const first=data.records[0];if(first.stage!=='global'||first.gain!==1)throw new Error('Initial global route required');
const table=JSON.stringify(first.entries),from=x=>{view.setUint32(0,x);return view.getFloat32(0);};
const routes=first.entries.map(e=>({...e,taps:Array.from({length:e.tapWords.length/6},(_,i)=>{
 const w=e.tapWords.slice(i*6,i*6+6).map(from);return {delay:w[0],startGain:w[1],endGain:w[2],multiplier:w[4]};
})}));
const globalMix=new GlobalRoutedMix64(first.cache,routes,!!first.wrap);
function cacheMetadata(actual){
 const cache=globalMix.cache;
 if(cache.sampleRate!==actual.sampleRate||cache.maximumDelay!==actual.maximumDelay||cache.rings.length!==actual.rings.length)throw new Error('Global cache layout differs');
 for(let i=0;i<cache.rings.length;i++){
  const p=cache.rings[i],a=actual.rings[i];
  if(['head','total','smallChunk','bigChunk'].some(k=>p[k]!==a[k])||p.flags.length!==a.flags.length||p.flags.some((x,j)=>x!==a.flags[j]))throw new Error('Global cache state differs');
 }
}
for(const r of data.records){
 scalar('frameStart',blocks*64,r.frameStart);
 if(r.stage==='global'){
  if(context||routed||r.R!==first.R||r.S!==first.S||r.gain!==1||r.wrap!==first.wrap||JSON.stringify(r.entries)!==table||r.input.rows!==2||r.input.samples!==64||r.sumInput.rows!==3||r.sumInput.samples!==64)throw new Error('Invalid global route');
  if(r.gateEnabled)activeRowGateBlocks++;
  cacheMetadata(r.cache);routed={thread:r.thread,...globalMix.process64(r.input.values,r.sumInput.values,r.gateEnabled,r.rowFlags)};
 }else if(r.stage==='entry'){
  if(r.state!==state||!routed||routed.thread!==r.thread)throw new Error('Cabinet not preceded by global route');
  if(context||r.source.rows!==9||r.source.samples!==64||r.before.rows!==3||r.before.samples!==64||r.mode!==1)throw new Error('Invalid cabinet entry');
  floats('gain',[1,1,0,0],r.gain);
  for(let row=0;row<3;row++)floats('global:beforeCabinet',routed.output[row],r.before.values[row]);
  const computed=model.process64(r.source.values,routed.output,r.mode);
  headProducts+=computed.headProducts;headNonemptyOutputs+=computed.headNonemptyOutputs;
  if(computed.tailWork){tailProducts+=computed.tailWork.products;tailNonemptyOutputs+=computed.tailWork.nonemptyOutputs;}
  context={thread:r.thread,source:r.source.values,computed};
 }else if(r.stage==='returned'){
  if(r.state!==state||!context||context.thread!==r.thread||r.output.rows!==3||r.output.samples!==64)throw new Error('Invalid cabinet return');
  for(let row=0;row<3;row++)floats('cabinet:output',context.computed.output[row],r.output.values[row]);
  context=null;routed=null;blocks++;
 }else throw new Error('Unknown cabinet stage');
}
const complete=blocks===400&&!context&&!routed&&data.records.length===1200;
const report={passed:complete&&!mismatches,count:count+scalarCount,matched:count+scalarCount-mismatches,floatCount:count,scalarCount,mismatches,
 windowComplete:complete,wrapperBlocks:blocks,wrapperLocalFrames:blocks*64,kernelSpectra,headProducts,headNonemptyOutputs,tailProducts,tailNonemptyOutputs,
 headAndTailComputed:true,outerAdditionComputed:true,irTimeSamplesObserved:true,compiledPlansObserved:true,sourceSamplesObserved:true,existingDestinationComputed:true,globalRouteInputObserved:true,globalSumInputObserved:true,globalCacheStateCarried:true,preCabinetRowMaskComputed:true,activeRowGateBlocks,activeRowGateNotDynamicallyVerified:true,
 globalPcmTimelineNotObserved:true,completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
