import {readTerminalArtifact} from './pianoteq_terminal_artifact.mjs';
import fs from 'node:fs';import path from 'node:path';
import {sha,readPcm} from './pianoteq_order_fixture.mjs';
export function readComputedVoiceEndpoints(reportPath,audioPath,fixture){
 const reportBytes=fs.readFileSync(reportPath),report=JSON.parse(reportBytes),bytes=fs.readFileSync(audioPath);
 if(report.schema!==1||report.mismatches!==0||report.blocks!==3314||report.voiceCount!==5||!report.spatialHistoriesOwned||!report.fadeAndSleepStatesOwned||report.nativeSpatialOrCouplingAudioUsedForPrediction!==false||report.poison.length||report.predictions.length!==3314||!report.computedAudioFile||path.resolve(report.computedAudioFile)!==path.resolve(audioPath)||bytes.length!==3314*3328||report.computedAudioBytes!==bytes.length||sha(bytes)!==report.computedAudioSha256)throw Error('Complete bound computed voice endpoint artifact required');
 if(report.producerSha256!==sha(fs.readFileSync(new URL('./pianoteq_replay_voice_spatial_pair.mjs',import.meta.url))))throw Error('Current voice endpoint producer identity required');
 const root=path.resolve(report.captureRoot),raw=fs.readFileSync(path.join(root,'runtime.json')),data=JSON.parse(raw),launch=JSON.parse(fs.readFileSync(path.join(root,'launch.json')));
 if(sha(raw)!==report.captureRuntimeSha256||!data.runStatus?.terminal||data.runStatus.exitStatus!==0||data.runStatus.pid!==report.nativeStatus.pid||data.targetMutation!==false||data.errors.length||data.pending!==null||data.hardwareBreakpoints!==2||data.activeHardwareBreakpoints!==1||data.alternatingSites!==true||data.inputs.length!==3314||data.outputs.length!==3314||data.outputs.some(r=>!r.willRoute)||data.phaseTransitions.length!==6628)throw Error('Successful complete source capture required');
 for(const [file,digest]of Object.entries(launch.helperSha256))if(sha(fs.readFileSync(path.join(root,'..',file)))!==digest)throw Error('Frozen voice source collector changed');
 const f=launch.fixture;
 if(f.midiSha256!==fixture.midiSha256||f.resourceSha256!==fixture.resourceSha256||f.selection.sha256!==fixture.selection.sha256)throw Error('Identical voice source fixture required');
 const args=[f.binaryPath,'--headless','--no-prefs','--multicore','0','--fxp',f.selection.path,'--midi',f.midiPath,'--wav',path.join(root,'observed.wav'),'--rate','48000','--bit-depth','24','--dither','OFF'];
 if(JSON.stringify(args)!==JSON.stringify(launch.arguments))throw Error('Identical explicit voice render settings required');
 for(const [file,digest]of [[f.midiPath,f.midiSha256],[f.resourcePath,f.resourceSha256],[f.selection.path,f.selection.sha256]])if(sha(fs.readFileSync(file))!==digest)throw Error('Voice source fixture changed');
 for(const name of ['source','target']){
  const stream=fs.readFileSync(path.join(root,data[name+'File']));
  if(stream.length!==data[name+'Bytes']||sha(stream)!==data[name+'Sha256'])throw Error('Complete native voice source streams required');
 }
 const pcm=readPcm(path.join(root,'observed.wav'));
 if(pcm.length/6!==report.nativePcmFrames||sha(pcm)!==report.nativePcmSha256||sha(bytes)!==data.targetSha256)throw Error('Computed endpoints and complete native source evidence differ');
 let terminalSource=null;
 if(report.terminalArtifact){terminalSource=readTerminalArtifact(report.terminalArtifact.directory,fixture);if(terminalSource.manifestSha256!==report.terminalArtifact.manifestSha256||terminalSource.audioSha256!==report.terminalArtifact.audioSha256||report.nativeTerminalAudioStillObserved!==false)throw Error('Bound calculated terminal source required');}
 else if(report.nativeTerminalAudioStillObserved!==true)throw Error('Explicit native terminal source boundary required');
 const voices=new Map(),ages=new Map();
 report.predictions.forEach((item,i)=>{
  const native=data.outputs[i],input=data.inputs[i],age=ages.get(item.epoch)??0,id=item.epoch+':'+item.counter;
  if(!Number.isInteger(item.epoch)||item.epoch<0||item.epoch>=5||item.counter!==age||voices.has(id)||item.offset!==i*3328||item.bytes!==3328||item.sha256!==sha(bytes.subarray(item.offset,item.offset+3328))||native.epoch!==item.epoch||native.counter!==item.counter||native.inputOrdinal!==i||input.epoch!==item.epoch||input.counter!==item.counter)throw Error('Exact complete generated voice keys required');
  const a=data.phaseTransitions[i*2],b=data.phaseTransitions[i*2+1];
  if(a.ordinal!==i||a.from!=='0x100460f1c'||a.to!=='0x10085ede4'||b.ordinal!==i+1||b.from!==a.to||b.to!==a.from)throw Error('Exact voice observation phases required');
  const rows=Array.from({length:13},(_,r)=>Float32Array.from({length:64},(_,j)=>{const value=bytes.readFloatLE(item.offset+(r*64+j)*4);if(!Number.isFinite(value))throw Error('Finite generated voice audio required');return value}));
  voices.set(id,{spatial:rows.slice(0,12),mono:rows[12]});ages.set(item.epoch,age+64);
 });
 if(ages.size!==5)throw Error('All five source voices required');
 return {voices,nativeTerminalAudioStillObserved:!terminalSource,nativeAuxiliaryEntryStillObserved:!!terminalSource,terminalManifestSha256:terminalSource?.manifestSha256??null,reportSha256:sha(reportBytes),audioSha256:sha(bytes),captureRuntimeSha256:report.captureRuntimeSha256};
}
