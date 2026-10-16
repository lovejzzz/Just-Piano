import fs from 'node:fs';
import crypto from 'node:crypto';
import {GlobalModalRecurrence64} from '../dsp/global-modal-recurrence.mjs';
import {GlobalControlProducer} from '../dsp/global-control-producer.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(data.schema!==1||!data.windowComplete||data.errors.length||data.minimumBlocks!==128||data.blocks!==128||Object.keys(data.configs).length!==3||!data.initial)throw new Error('Complete global control window required');
function hash(values){const bytes=Buffer.alloc(values.length*4);for(let i=0;i<values.length;i++){if(!Number.isFinite(values[i]))throw new Error('Nonfinite coefficient');bytes.writeFloatLE(values[i],i*4);}return crypto.createHash('sha256').update(bytes).digest('hex');}
for(const config of Object.values(data.configs)){
 if(hash(config.coefficients)!==config.coefficientSha256||!config.coefficientVersions?.[config.coefficientSha256])throw new Error('Initial coefficient identity differs');
 for(const [digest,values] of Object.entries(config.coefficientVersions))if(values.length!==config.vectorCount*16||hash(values)!==digest)throw new Error('Coefficient target identity differs');
}
if(data.transitions.length!==1||data.transitions[0].ordinal!==0||data.transitions[0].disable!=='initial'||data.transitions[0].enable!=='producer'||data.transitions[0].activeSites!==3)throw new Error('Invalid fixed hardware point transition');
const models=new Map(Object.entries(data.configs).map(([key,c])=>[key,new GlobalModalRecurrence64(c)]));
const keys=[...models.keys()],producer=new GlobalControlProducer(data.initial);
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const failures=[];let floatCount=0,scalarCount=0,mismatches=0,nonzeroOutputBlocks=0,producerCalls=0,cursor=0;
function floats(name,p,a){if(p.length!==a.length)throw new Error('Global control shape differs');for(let i=0;i<p.length;i++){floatCount++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite global value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
function scalar(name,p,a){scalarCount++;if(p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
function dynamic(name,target){
 if(target.object!==data.initial.object||target.staticIdentity!==data.initial.staticIdentity||target.dynamic.length!==producer.modeCount)throw new Error('Global producer profile identity differs');
 for(let i=0;i<producer.modeCount;i++){floats(name+':mode:'+i,producer.dynamic[i].slice(0,3),target.dynamic[i].slice(0,3));scalar(name+':flag',producer.dynamic[i][3],target.dynamic[i][3]);}
}
function compareSets(predicted,target){
 if(target.length!==2)throw new Error('Invalid dirty-set target');
 for(let i=0;i<2;i++){
  for(const key of ['pointer','count','flag'])scalar('dirty:'+key,predicted[i][key],target[i][key]);
  if(predicted[i].words.length!==target[i].words.length)throw new Error('Invalid dirty-word shape');
  for(let j=0;j<predicted[i].words.length;j++)scalar('dirty:word',BigInt(predicted[i].words[j]).toString(),BigInt(target[i].words[j]).toString());
 }
}
for(let n=0;n<128;n++){
 let entry=null;
 if(data.records[cursor]?.stage==='producer'){entry=data.records[cursor++];if(entry.ordinal!==n)throw new Error('Invalid control chronology');}
 const body=data.records[cursor++],returned=data.records[cursor++];
 if(!body||!returned||body.stage!=='body'||returned.stage!=='bodyResult'||body.ordinal!==n||returned.ordinal!==n||body.thread!==returned.thread||body.producerRan!==Boolean(entry)||body.dispatch.variant!==0||body.dispatch.state!==data.initial.object||body.dispatch.kernels.length!==3||returned.kernels.length!==3||body.outputBefore.rows!==1||returned.output.rows!==1)throw new Error('Invalid producer/modal chronology');
 if(entry){
  if(entry.thread!==body.thread)throw new Error('Control thread differs');
  dynamic('before',entry.snapshot);
  const result=producer.process(entry.snapshot);producerCalls++;
  for(const update of result.updates){
   const model=models.get(body.dispatch.kernels[update.kernel]?.object);
   if(!model||update.index>=data.configs[body.dispatch.kernels[update.kernel].object].modeCount)throw new Error('Invalid computed coefficient destination');
   model.setModeCoefficients(update.index,update.arguments);
  }

 }
 compareSets(producer.getBitsets(),body.producerAfter.bitsets);
 dynamic('after',body.producerAfter);
 let output=Float32Array.from(body.outputBefore.values[0]);
 for(let k=0;k<3;k++){
  const b=body.dispatch.kernels[k],a=returned.kernels[k],model=models.get(b.object),config=data.configs[b.object];
  if(!model||keys[k]!==b.object||a.object!==b.object||b.target!=='0x100657dfc'||body.inputs[k].rows!==1||body.inputs[k].samples!==64)throw new Error('Unverified global recurrence owner');
  const target=config.coefficientVersions?.[b.coefficientSha256];if(!target)throw new Error('Missing coefficient comparison target');
  floats('coefficient:table',model.coefficients,target);
  scalar('before:vectorCount',model.vectorCount,b.vectorCount);scalar('before:counter',model.counter,b.counter);scalar('before:disabled',0,b.disabled);
  floats('before:previous',[model.previousInput],[b.previousInput]);floats('before:states',model.states,b.states);
  output=model.process64(body.inputs[k].values[0],output);
  scalar('after:counter',model.counter,a.counter);scalar('after:disabled',0,a.disabled);
  floats('after:previous',[model.previousInput],[a.previousInput]);floats('after:states',model.states,a.states);
 }
 floats('body:output',output,returned.output.values[0]);if(output.some(x=>x!==0))nonzeroOutputBlocks++;
}
if(cursor!==data.records.length||!producerCalls||!producer.refreshCount||!producer.limitedCount)throw new Error('Incomplete producer coverage');
const count=floatCount+scalarCount,report={passed:!mismatches,count,matched:count-mismatches,floatCount,scalarCount,mismatches,windowComplete:true,blocks:128,
 producerCalls,modeCount:producer.modeCount,weightedModeCount:producer.weightedModeCount,weightedUpdates:producer.weightedCount,coefficientRefreshes:producer.refreshCount,limitedUpdates:producer.limitedCount,externalDirtyMarks:producer.externalMarks,internalDirtyMarksCarried:producer.internalMarksCarried,
 kernelCount:models.size,vectorCounts:[...models.values()].map(m=>m.vectorCount),periodicClips:[...models.values()].map(m=>m.clips),nonzeroOutputBlocks,
 globalModeControlProducerComputed:true,globalModalRecurrenceComputed:true,modeControlStatesCarried:true,modalStatesCarried:true,initialCoefficientsAndModeFieldsObserved:true,
 keyControlsAndNewDirtyMarksObserved:true,dirtySetsCarried:true,dirtyFlagsComputed:true,globalControlObserved:true,coefficientTargetsComparisonOnly:true,inputSamplesObserved:true,existingMonoOutputObserved:true,
 globalDriveAndSpatialReturnNotComputed:true,completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
