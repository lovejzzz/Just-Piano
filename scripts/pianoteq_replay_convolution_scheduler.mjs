import fs from 'node:fs';
import crypto from 'node:crypto';
import {PartitionedConvolution64} from '../dsp/partitioned-convolution.mjs';
const [capturePath,reportPath,flag,kernelPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||flag!=='--kernel-time-inputs'||!kernelPath||extra.length)throw new Error('Usage: capture.json report.json --kernel-time-inputs kernels.json');
const captureBytes=fs.readFileSync(capturePath),data=JSON.parse(captureBytes),kernelEvidence=JSON.parse(fs.readFileSync(kernelPath,'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(kernelEvidence.schema!==1||kernelEvidence.crossRunInitialization!==true||kernelEvidence.targetSha256!==sha(captureBytes)||kernelEvidence.sourceSha256!==sha(fs.readFileSync(kernelEvidence.sourceCapture)))throw new Error('Kernel evidence binding differs');
if(data.schema!==1||data.threadIndexFilter!==1||data.minimumOutputs!==129||!data.windowComplete||data.errors.length)throw new Error('Complete scheduler window required');
const kernelView=new DataView(new ArrayBuffer(4));
const banks=new Map(Object.entries(data.configs).map(([key,c])=>{
 const kernels=c.kernels.map(r=>r&&({...r,slots:r.slots.map(s=>{
  if(s.empty)return s;
  const source=kernelEvidence.kernels[key]?.[s.object];if(source?.inputBits.length!==128)throw new Error('Kernel time producer missing');
  const timeInput=Float32Array.from(source.inputBits,bits=>{kernelView.setUint32(0,bits);return kernelView.getFloat32(0);});
  return {...s,timeInput};
 })}));
 return [key,{model:new PartitionedConvolution64({...c,kernels}),products:[],outputs:new Map()}];
}));
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const failures=[];let floatCount=0,scalarCount=0,mismatches=0,pushes=0,schedules=0,products=0,outputs=0;
function scalar(name,p,a){scalarCount++;if(p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
function floats(name,p,a){if(p?.length!==a?.length)throw new Error('Scheduler array shape differs');for(let i=0;i<p.length;i++){floatCount++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite scheduler value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
function state(name,p,a){for(const key of ['object','buffer','empty','content','timestamp'])scalar(`${name}:${key}`,p[key],a[key]);}
for(const [key,c] of Object.entries(data.configs))for(let j=0;j<c.kernels.length;j++){
 const r=c.kernels[j];if(r)for(let k=0;k<r.slots.length;k++)if(!r.slots[k].empty)floats('initial:kernel',banks.get(key).model.kernels[j].slots[k].data,r.slots[k].data);
}
for(const r of data.records){
 const b=banks.get(r.bank);if(!b)throw new Error('Unknown convolution bank');
 if(r.stage==='push'){
  if(b.products.length||b.outputs.size)throw new Error('Unconsumed block before push');
  scalar('push:step',0,r.step);const before=b.model.push(r.channel,r.timestamp,r.input);
  // push() advances the cursor; before identifies the independently selected old slot.
  scalar('push:cursor',(b.model.inputs[r.channel].cursor+b.model.inputs[r.channel].slots.length-1)%b.model.inputs[r.channel].slots.length,r.cursor);
  state('push:before',before,r.before);pushes++;
 }else if(r.stage==='schedule'){
  if(b.products.length||b.outputs.size)throw new Error('Unconsumed block at schedule');
  scalar('schedule:step',0,r.step);
  if(r.inputs.length!==b.model.inputs.length)throw new Error('Input ring count differs');
  for(let j=0;j<r.inputs.length;j++){
   const p=b.model.inputs[j],a=r.inputs[j];if(!p||!a){scalar('ring:null',p===null,a===null);continue;}
   scalar('ring:object',p.object,a.object);scalar('ring:cursor',p.cursor,a.cursor);scalar('ring:ready',p.ready,a.ready);
   if(p.slots.length!==a.slots.length)throw new Error('Ring size differs');
   for(let k=0;k<p.slots.length;k++)state('ring:slot',p.slots[k],a.slots[k]);
  }
  const computed=b.model.run();b.products=computed.products;b.outputs=computed.outputs;schedules++;
 }else if(r.stage==='product'){
  const p=b.products.shift();if(!p||r.ordinal!==products)throw new Error('Unexpected product selection/order');
  state('product:a',p.a,r.a);state('product:b',p.b,r.b);state('product:destination',{...p.destination,empty:0,content:0},r.destination);
  floats('product:a',p.a.data,r.a.data);floats('product:b',p.b.data,r.b.data);floats('product:before',p.before,r.destination.data);
  floats('product:scale',[p.scale],[r.scale]);products++;
 }else if(r.stage==='output'){
  if(b.products.length)throw new Error('Output before scheduled products');
  const p=b.outputs.get(r.fft.object);if(!p||r.ordinal!==outputs)throw new Error('Unexpected output selection');
  const descriptor=b.model.outputs.find(o=>o?.fft.object===p.object).fft;
  state('output:fft',{...descriptor,empty:0,content:1},r.fft);floats('output:inverse',p.inverse,r.fft.data);
  floats('output:result',p.output,r.output);floats('output:tail',p.tail,r.tail);b.outputs.delete(p.object);outputs++;
 }else throw new Error('Unknown scheduler stage');
}
const consumed=products===data.productCount&&outputs===data.outputCount&&outputs>=data.minimumOutputs&&[...banks.values()].every(b=>!b.products.length&&!b.outputs.size);
const count=floatCount+scalarCount;
const report={passed:consumed&&!mismatches,count,matched:count-mismatches,floatCount,scalarCount,mismatches,windowComplete:consumed,
 banks:banks.size,pushes,schedules,products,outputs,inputCopiesAndFftsComputed:true,ringCursorsAndSelectionsComputed:true,inverseAndOverlapComputed:true,
 inputSamplesObserved:true,compiledPlanObserved:true,kernelTimeSamplesObserved:true,kernelSpectraCalculated:true,crossRunKernelInitialization:true,
 completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
