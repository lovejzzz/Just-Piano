import fs from 'node:fs';
import crypto from 'node:crypto';
import {GlobalModalRecurrence64,globalModeCoefficientArguments} from '../dsp/global-modal-recurrence.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(data.schema!==1||!data.windowComplete||data.errors.length||data.minimumBlocks!==128||data.blocks!==128||data.records.length!==384||Object.keys(data.configs).length!==3)throw new Error('Complete global recurrence window required');
function coefficientHash(values){const bytes=Buffer.alloc(values.length*4);for(let i=0;i<values.length;i++){if(!Number.isFinite(values[i]))throw new Error('Nonfinite coefficient');bytes.writeFloatLE(values[i],i*4);}return crypto.createHash('sha256').update(bytes).digest('hex');}
for(const config of Object.values(data.configs)){
 if(coefficientHash(config.coefficients)!==config.coefficientSha256||!config.coefficientVersions?.[config.coefficientSha256])throw new Error('Initial coefficient identity differs');
 for(const [digest,values] of Object.entries(config.coefficientVersions))if(values.length!==config.vectorCount*16||coefficientHash(values)!==digest)throw new Error('Coefficient version identity differs');
}
if(data.transitions.length!==1||data.transitions[0].ordinal!==0||data.transitions[0].enable!=='store'||data.transitions[0].activeSites!==4||!data.writes.length)throw new Error('Missing coefficient write capture');
const models=new Map(Object.entries(data.configs).map(([key,c])=>[key,new GlobalModalRecurrence64(c)]));
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const failures=[];let floatCount=0,scalarCount=0,mismatches=0,nonzeroOutputBlocks=0;
const coefficientUpdates=[];let writeCursor=0;
function floats(name,p,a){if(p.length!==a.length)throw new Error('Global recurrence shape differs');for(let i=0;i<p.length;i++){floatCount++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite recurrence value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
function scalar(name,p,a){scalarCount++;if(p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
for(let n=0;n<128;n++){
 const [entry,body,returned]=data.records.slice(n*3,n*3+3);
 if([entry,body,returned].some((r,i)=>r.stage!==['global','body','bodyResult'][i]||r.ordinal!==n||r.thread!==entry.thread)||body.dispatch.variant!==0||body.dispatch.kernels.length!==3||returned.kernels.length!==3||body.outputBefore.rows!==1||returned.output.rows!==1)throw new Error('Invalid global producer chronology');
 while(writeCursor<data.writes.length&&data.writes[writeCursor].ordinal===n){
  const w=data.writes[writeCursor++],model=models.get(w.object),config=data.configs[w.object];
  if(!model||w.thread!==entry.thread||!Number.isInteger(w.index)||w.index<0||w.index>=config.modeCount||!data.stacks[w.caller]?.length)throw new Error('Invalid coefficient write owner/index');
  const offset=Math.floor(w.index/4)*16+w.index%4;
  floats('coefficient:before',[0,1,2,3].map(c=>model.coefficients[offset+c*4]),w.before);
  if(!w.producer||w.producer.kernelMode!==w.index||body.dispatch.state!==w.producer.object||body.dispatch.kernels[w.producer.kernelIndex]?.object!==w.object)throw new Error('Coefficient producer binding differs');
  const argumentsComputed=globalModeCoefficientArguments(w.producer.timeScale,w.producer.fields);
  floats('coefficient:arguments',argumentsComputed,w.arguments);
  model.setModeCoefficients(w.index,argumentsComputed);
  coefficientUpdates.push({block:n,kernel:[...models.keys()].indexOf(w.object),index:w.index});
 }
 let output=Float32Array.from(body.outputBefore.values[0]);
 for(let k=0;k<3;k++){
  const b=body.dispatch.kernels[k],a=returned.kernels[k],model=models.get(b.object),config=data.configs[b.object];
  if(!model||a.object!==b.object||b.target!=='0x100657dfc'||body.inputs[k].rows!==1||body.inputs[k].samples!==64)throw new Error('Unverified global recurrence owner/coefficients');
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
if(writeCursor!==data.writes.length)throw new Error('Unconsumed coefficient write');
const count=floatCount+scalarCount,report={passed:!mismatches,count,matched:count-mismatches,floatCount,scalarCount,mismatches,windowComplete:true,blocks:128,
 kernelCount:models.size,vectorCounts:[...models.values()].map(m=>m.vectorCount),periodicClips:[...models.values()].map(m=>m.clips),nonzeroOutputBlocks,
 globalModalRecurrenceComputed:true,statesCarried:true,initialStatesRequiredZero:true,initialCoefficientsObserved:true,coefficientWritesComputed:true,coefficientWriteArgumentsComputed:true,selectedDecayAndModeFieldsObserved:true,coefficientWriteCount:coefficientUpdates.length,coefficientWriteBlocks:[...new Set(coefficientUpdates.map(w=>w.block))],coefficientProductionNotComputed:true,inputSamplesObserved:true,existingMonoOutputObserved:true,
 globalDriveAndSpatialReturnNotComputed:true,completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
