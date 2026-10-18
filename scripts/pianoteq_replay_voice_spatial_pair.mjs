import {readTerminalArtifact} from './pianoteq_terminal_artifact.mjs';
import fs from 'node:fs';import path from 'node:path';
import {VoiceSpatialEndpoint64} from '../dsp/voice-spatial-endpoint.mjs';
import {sha,numericalHash,readPcm} from './pianoteq_order_fixture.mjs';
const [directory,reportPath,...flags]=process.argv.slice(2),root=path.resolve(directory);
const terminalFlags=flags.filter(x=>x.startsWith('--terminal-artifact='));
if(terminalFlags.length>1)throw Error('One calculated terminal artifact required');
const audioFlags=flags.filter(x=>x.startsWith('--output-audio=')),audioPath=audioFlags[0]?.slice('--output-audio='.length);
if(!reportPath||audioFlags.length>1||new Set(flags).size!==flags.length||flags.some(x=>!x.startsWith('--output-audio=')&&!x.startsWith('--terminal-artifact=')&&!['--poison-mono-target','--poison-ring-target'].includes(x)))throw Error('Usage: complete-private-pair fresh-private-report [--output-audio=fresh-private.bin] [--poison-mono-target|--poison-ring-target]');
for(const file of [reportPath,audioPath].filter(Boolean))if(fs.existsSync(file)||path.resolve(file).startsWith(path.resolve('.')+path.sep))throw Error('Fresh private artifacts required');
const runtime=fs.readFileSync(path.join(root,'runtime.json')),data=JSON.parse(runtime),launch=JSON.parse(fs.readFileSync(path.join(root,'launch.json')));
if(!data.runStatus?.terminal||data.runStatus.exitStatus!==0||data.targetMutation!==false||data.hardwareBreakpoints!==2||data.errors.length||data.pending!==null||data.inputs.length!==3314||data.outputs.length!==3314||Object.keys(data.profiles).length!==5||data.outputs.some(r=>!r.willRoute))throw Error('Complete routed primary voice-spatial pair required');
if(data.alternatingSites!==true||data.activeHardwareBreakpoints!==1||data.unrenderedExitCallsObserved!==false||data.phaseTransitions.length!==6628)throw Error('Complete exclusive terminal/exit phase audit required');
for(let i=0;i<3314;i++){
 const a=data.phaseTransitions[i*2],b=data.phaseTransitions[i*2+1];
 if(a.ordinal!==i||a.from!=='0x100460f1c'||a.to!=='0x10085ede4'||b.ordinal!==i+1||b.from!==a.to||b.to!==a.from)throw Error('Exact paired observation phases required');
}
for(const [file,digest]of Object.entries(launch.helperSha256))if(sha(fs.readFileSync(path.join(root,'..',file)))!==digest)throw Error('Frozen capture helper changed');
const f=launch.fixture;
for(const [file,digest]of [[f.midiPath,f.midiSha256],[f.resourcePath,f.resourceSha256],[f.selection.path,f.selection.sha256]])if(sha(fs.readFileSync(file))!==digest)throw Error('Bound fixture changed');
const args=[f.binaryPath,'--headless','--no-prefs','--multicore','0','--fxp',f.selection.path,'--midi',f.midiPath,'--wav',path.join(root,'observed.wav'),'--rate','48000','--bit-depth','24','--dither','OFF'];
if(JSON.stringify(args)!==JSON.stringify(launch.arguments))throw Error('Explicit primary render arguments required');
const terminalSource=terminalFlags.length?readTerminalArtifact(terminalFlags[0].slice('--terminal-artifact='.length),f):null;
const source=fs.readFileSync(path.join(root,data.sourceFile)),target=fs.readFileSync(path.join(root,data.targetFile));
if(source.length!==data.sourceBytes||target.length!==data.targetBytes||sha(source)!==data.sourceSha256||sha(target)!==data.targetSha256||source.length!==3314*1536||target.length!==3314*3328)throw Error('Complete bound audio streams required');
const decode=(bytes,offset,rows)=>Array.from({length:rows},(_,r)=>Float32Array.from({length:64},(_,i)=>{const v=bytes.readFloatLE(offset+(r*64+i)*4);if(!Number.isFinite(v))throw Error('Finite complete audio required');return v}));
const models=new Map(Object.entries(data.profiles).map(([epoch,p])=>[Number(epoch),new VoiceSpatialEndpoint64(p)]));
const stages={},failures=[],predictions=[],parts=[],ages=new Map();let monoPoisoned=false,ringPoisoned=false;
function check(stage,p,a,context){const s=stages[stage]??={checks:0,mismatches:0};s.checks++;if(!Object.is(p,a)){s.mismatches++;if(failures.length<25)failures.push({stage,predicted:p,target:a,...context})}}
const word=new DataView(new ArrayBuffer(4));const bits=x=>{word.setFloat32(0,x,true);return word.getUint32(0,true)};
function state(model,target,context,after){
 check('fade-counter',model.fade.counter,target.fadeCounter,context);
 for(let i=0;i<3;i++){
  check('sleep-input',model.sleep.inputCounters[i],target.inputCounters[i],context);check('sleep-output',model.sleep.outputCounters[i],target.outputCounters[i],context);
  check('ring-vectors',model.rows[i].vectors,target.rows[i].vectors,context);check('ring-counter',model.rows[i].counter,target.rows[i].counter,context);
  let digest=target.rows[i].ringSha256;
  if(after&&!ringPoisoned&&flags.includes('--poison-ring-target')){digest=(digest[0]==='0'?'1':'0')+digest.slice(1);ringPoisoned=true;}
  check('ring-history',sha(Buffer.from(model.rows[i].ring.buffer)),digest,context);
 }
}
for(let ordinal=0;ordinal<3314;ordinal++){
 const input=data.inputs[ordinal],output=data.outputs[ordinal],model=models.get(input.epoch),age=ages.get(input.epoch)??0,context={ordinal,epoch:input.epoch,counter:input.counter};
 if(!model||input.ordinal!==ordinal||output.ordinal!==ordinal||output.inputOrdinal!==ordinal||output.epoch!==input.epoch||output.counter!==input.counter||input.counter!==age||output.nativeAge!==age+64||input.offset!==ordinal*1536||input.bytes!==1536||output.offset!==ordinal*3328||output.bytes!==3328||sha(source.subarray(input.offset,input.offset+1536))!==input.sha256||sha(target.subarray(output.offset,output.offset+3328))!==output.sha256)throw Error('Complete chronological paired voice blocks required');
 if(numericalHash(model.configuration)!==numericalHash(input.spatial.configuration)||numericalHash(model.configuration)!==numericalHash(output.spatial.configuration))throw Error('Changing spatial controls not implemented');
 state(model,input.spatial,context,false);
 const observedRows=decode(source,input.offset,6),rows=terminalSource?terminalSource.voices.get(input.epoch+':'+input.counter):observedRows;
 if(!rows)throw Error('Missing calculated terminal block');
 if(terminalSource)rows.forEach((row,r)=>row.forEach((v,i)=>check('calculated-terminal-source',bits(v),bits(observedRows[r][i]),{...context,row:r,sample:i})));
 const own=model.process64(rows.slice(0,3),rows.slice(3)),actual=decode(target,output.offset,13),computed=[...own.spatial,own.mono];
 const packed=Buffer.alloc(3328);
 computed.forEach((row,r)=>row.forEach((v,i)=>{
  packed.writeFloatLE(v,(r*64+i)*4);let expected=bits(actual[r][i]);
  if(r===12&&!monoPoisoned&&actual[r][i]!==0&&flags.includes('--poison-mono-target')){expected=(expected^1)>>>0;monoPoisoned=true;}
  check(r===12?'coupling-mono':'spatial-audio',bits(v),expected,{...context,row:r,sample:i});
 }));
 state(model,output.spatial,context,true);parts.push(packed);predictions.push({epoch:input.epoch,counter:age,offset:ordinal*3328,bytes:3328,sha256:sha(packed)});ages.set(input.epoch,age+64);
}
if(flags.includes('--poison-mono-target')&&!monoPoisoned||flags.includes('--poison-ring-target')&&!ringPoisoned)throw Error('Requested negative target not exercised');
const computed=Buffer.concat(parts),pcm=readPcm(path.join(root,'observed.wav'));
if(audioPath)fs.writeFileSync(audioPath,computed,{flag:'wx'});
const report={schema:1,captureRoot:root,producerSha256:sha(fs.readFileSync(new URL(import.meta.url))),captureRuntimeSha256:sha(runtime),fixture:f,nativeStatus:data.runStatus,blocks:3314,voiceCount:5,alternatingSites:true,unrenderedExitCallsObserved:false,stages,failures,mismatches:Object.values(stages).reduce((n,s)=>n+s.mismatches,0),computedAudioSha256:sha(computed),computedAudioBytes:computed.length,computedAudioFile:audioPath?path.resolve(audioPath):null,layout:'nine group spatial rows, three auxiliary rows, one coupling mono row;64 float32 samples each',predictions,nativePcmFrames:pcm.length/6,nativePcmSha256:sha(pcm),spatialHistoriesOwned:true,fadeAndSleepStatesOwned:true,terminalArtifact:terminalSource?{directory:terminalSource.directory,manifestSha256:terminalSource.manifestSha256,audioSha256:terminalSource.audioSha256}:null,nativeAuxiliaryEntryStillObserved:!!terminalSource,nativeTerminalAudioStillObserved:!terminalSource,initialSpatialProfileStillObserved:true,nativeSpatialOrCouplingAudioUsedForPrediction:false,independentStereoAudioVerified:false,completeMechanicalCouplingVerified:false,mixedSleepBlocks:[...models.values()].reduce((n,m)=>n+m.mixedBlocks,0),inactiveSleepBlocks:[...models.values()].reduce((n,m)=>n+m.inactiveBlocks,0),poison:flags.filter(x=>x.startsWith('--poison-'))};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,fixture:undefined,stages:undefined,failures:undefined,predictions:undefined}));if(report.mismatches)process.exitCode=1;
