import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {GlobalPedalControl} from '../dsp/global-pedal-control.mjs';
import {GlobalRawKeys} from '../dsp/global-raw-keys.mjs';
import {GlobalControlProducer} from '../dsp/global-control-producer.mjs';
import {GlobalKeyMapping} from '../dsp/global-key-mapping.mjs';
import {GlobalModalRecurrence64} from '../dsp/global-modal-recurrence.mjs';
import {readPcm} from './pianoteq_order_fixture.mjs';
const [directory,output,...flags]=process.argv.slice(2),root=path.resolve(directory);
if(!output||flags.length>1||flags.some(x=>!['--poison-coefficient-target','--poison-dynamic-target','--poison-global-control-target'].includes(x))||fs.existsSync(output))throw Error('Fresh report and allowed control required');
const bytes=fs.readFileSync(path.join(root,'runtime.json')),data=JSON.parse(bytes),launch=JSON.parse(fs.readFileSync(path.join(root,'launch.json')));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
if(!data.runStatus?.terminal||data.runStatus.exitStatus!==0||data.targetMutation!==false||data.errors.length||data.hardwareBreakpoints!==2||data.activeHardwareBreakpoints!==1||data.records.length!==2320||data.raw.records.length!==2320||data.raw.warmups.length!==1||data.raw.pending||data.coefficients.records.length!==2320||data.coefficients.warmup.kind!=='completed')throw Error('Complete authentic two-site run required');
for(const [file,digest]of Object.entries(launch.helperSha256))if(hash(fs.readFileSync(path.join(root,'..',file)))!==digest)throw Error('Collector closure changed');
const f=launch.fixture;
for(const [file,digest]of [[f.midiPath,f.midiSha256],[f.resourcePath,f.resourceSha256],[f.selection.path,f.selection.sha256]])if(hash(fs.readFileSync(file))!==digest)throw Error('Exact fixture changed');
const expected=[f.binaryPath,'--headless','--no-prefs','--multicore','0','--fxp',f.selection.path,'--midi',f.midiPath,'--wav',path.join(root,'observed.wav'),'--rate','48000','--bit-depth','24','--dither','OFF'];
if(JSON.stringify(launch.arguments)!==JSON.stringify(expected))throw Error('Explicit primary render required');
const initial=data.coefficients.initial,scalarControl=new GlobalPedalControl({...data.coefficients.initial.globalScalar,sampleRate:48000,samples:64}),controlStream=crypto.createHash('sha256'),producer=new GlobalControlProducer(initial.producer),mapper=new GlobalKeyMapping(initial.keys,initial.producer,producer),cold=structuredClone(data.raw.initial.rawKeys);
for(const k of cold.keys)for(const n of k.nodes){n.position=0;n.intermediate=0;}
const raw=new GlobalRawKeys(cold),models=initial.kernelObjects.map(id=>{
 const c=data.configs[id];if(!c||hash(floatBytes(c.coefficients))!==c.coefficientSha256)throw Error('Bound initial coefficient table required');
 for(const [digest,table]of Object.entries(c.coefficientVersions))if(hash(floatBytes(table))!==digest)throw Error('Bound coefficient target version required');
 return new GlobalModalRecurrence64(c);
});
function floatBytes(values){const b=Buffer.alloc(values.length*4);values.forEach((x,i)=>{if(!Number.isFinite(x))throw Error('Finite coefficient required');b.writeFloatLE(x,i*4)});return b;}
const stages={},failures=[],stream=crypto.createHash('sha256');
function check(stage,predicted,target,block,index){const s=stages[stage]??={checks:0,mismatches:0};s.checks++;if(!Object.is(predicted,target)){s.mismatches++;if(failures.length<25)failures.push({stage,block,index,predicted,target});}}
function scalarState(target,block,phase){
 for(const field of ['threshold','forceExtra','sampleRate','samples','previousAbove','rearmRemaining','holdRemaining','holdValue','effective','bodyEnabled','excitationEnabled'])check('scalar-'+phase+'-'+field,scalarControl[field],target[field],block,0);
}
function state(target,block){
 const packed=Buffer.alloc(producer.dynamic.length*13);producer.dynamic.forEach((r,i)=>{for(let j=0;j<3;j++)packed.writeFloatLE(r[j],i*13+j*4);packed[i*13+12]=r[3]});
 let digest=target.dynamicSha256;if(block===0&&flags.includes('--poison-dynamic-target'))digest=(digest[0]==='0'?'1':'0')+digest.slice(1);
 check('dynamic',hash(packed),digest,block,0);check('global',mapper.globalControl,target.globalControl,block,0);check('rawGlobal',mapper.rawGlobalControl,target.rawGlobalControl,block,0);
 mapper.keys.forEach((k,i)=>{for(const field of ['raw','value','flag'])check('key-'+field,k[field],target.keys[i][field],block,i)});
 producer.getBitsets().forEach((s,i)=>{for(const field of ['pointer','count','flag'])check('set-'+field,s[field],target.bitsets[i][field],block,i);s.words.forEach((v,j)=>check('set-word',BigInt(v).toString(),BigInt(target.bitsets[i].words[j]).toString(),block,j))});
}
const warm=data.raw.warmups[0];if(warm.frameEndTarget!==0)throw Error('Zero-time initializer required');
const wk=raw.process(warm.rawBefore,{timeStep:0});mapper.mapKeys(wk.values,wk.flags,initial.curve);state(data.coefficients.warmup.target,-1);
for(let block=0;block<2320;block++){
 const r=data.raw.records[block],record=data.records[block],target=data.coefficients.records[block];
 if(r.ordinal!==block||record.ordinal!==block||target.ordinal!==block||r.frameEndTarget!==(block+1)*64||r.rawBefore.samples!==64||r.rawBefore.sampleRate!==48000)throw Error('Complete fixed sample clock required');
 const k=raw.process(r.rawBefore);k.values.forEach((v,i)=>check('raw-key',v,r.input[i],block,i));mapper.mapKeys(k.values,k.flags,initial.curve);
 scalarState(record.scalarBefore,block,'before');
 check('scalar-pedal-input',r.rawBefore.pedalControl,record.scalarBefore.pedal,block,0);
 check('scalar-extra-input',r.rawBefore.extraPedalControl,record.scalarBefore.extraPedal,block,0);
 const ownControl=scalarControl.process(r.rawBefore.pedalControl,r.rawBefore.extraPedalControl);
 if(!ownControl.shouldUpdate)throw Error('Inspected baseline requires active coefficient dispatch');
 scalarState(target.scalarTarget,block,'after');
 const encodedControl=Buffer.alloc(4);encodedControl.writeFloatLE(ownControl.output);controlStream.update(encodedControl);
 let expectedControl=target.target.rawGlobalControl;
 if(block===0&&flags.includes('--poison-global-control-target')){const b=Buffer.alloc(4);b.writeFloatLE(expectedControl);b.writeUInt32LE(b.readUInt32LE()^1);expectedControl=b.readFloatLE();}
 check('computed-global-control',ownControl.output,expectedControl,block,0);
 for(const u of mapper.mapGlobal(ownControl.output,initial.curve).updates)models[u.kernel].setModeCoefficients(u.index,u.arguments);
 state(target.target,block);
 models.forEach((m,i)=>{const b=floatBytes(m.coefficients);stream.update(b);let digest=record.coefficientSha256[i];if(block===0&&i===0&&flags.includes('--poison-coefficient-target'))digest=(digest[0]==='0'?'1':'0')+digest.slice(1);check('coefficient-table',hash(b),digest,block,i)});
}
const pcm=readPcm(path.join(root,'observed.wav'));
const report={schema:1,captureRuntimeSha256:hash(bytes),nativeStatus:data.runStatus,blocks:2320,nativePcmFrames:pcm.length/6,nativePcmSha256:hash(pcm),stages,failures,mismatches:Object.values(stages).reduce((n,s)=>n+s.mismatches,0),computedCoefficientStreamSha256:stream.digest('hex'),coefficientRefreshes:producer.refreshCount,rateLimitedUpdates:producer.limitedCount,keyChanges:mapper.keyChanges,producerCalls:mapper.producerCalls,initialNativeCoefficientProfileStillObserved:true,rawGlobalControlStillObserved:false,rawPedalInputsStillObserved:true,globalScalarStateCarried:true,nativeInitialScalarCounterStateUsedForPrediction:false,computedRawGlobalControlSha256:controlStream.digest('hex'),rawNodeLifecycleAndVelocitiesStillObserved:true,nativeDynamicCoefficientTablesUsedForPrediction:false,independentStereoAudioVerified:false,fullMechanicalCouplingVerified:false,poison:flags[0]??null};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,stages:undefined,failures:undefined}));if(report.mismatches)process.exitCode=1;
