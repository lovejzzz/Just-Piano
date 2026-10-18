import fs from 'node:fs';import path from 'node:path';
import {midiBlockClock} from '../dsp/midi-block-clock.mjs';
import {sha,numericalHash,readPcm} from './pianoteq_order_fixture.mjs';
// A compact capture can test order sufficiency, but cannot prove equality of
// the target's unobserved global controls, profiles, states or writer scheduling.
export function loadCompactOrderFixture(directory,reference){
 const root=path.resolve(directory),raw=fs.readFileSync(path.join(root,'runtime.json')),d=JSON.parse(raw);
 const launch=JSON.parse(fs.readFileSync(path.join(root,'launch.json'))),fixture=launch.fixture;
 if(!d.runStatus?.terminal||d.runStatus.exitStatus!==0||d.errors.length||d.keyAudioErrors.length||d.targetMutation!==false||
    d.compactVoiceOrder!==true||d.hardwareBreakpoints!==1||d.activeHardwareBreakpoints!==1||d.globalControlsObserved!==false||d.globalStatesObserved!==false||d.keyAudioSite!=='0x10051fad4'||d.keyAudioRecords.length!==3314)throw Error('Complete successful one-site compact capture required');
 if(numericalHash(fixture)!==numericalHash(reference.fixture))throw Error('Identical compact and reference fixtures required');
 for(const [file,digest]of Object.entries(launch.helperSha256))if(sha(fs.readFileSync(path.join(root,'..',file)))!==digest)throw Error('Frozen compact collector changed');
 for(const [file,digest]of [[fixture.midiPath,fixture.midiSha256],[fixture.resourcePath,fixture.resourceSha256],[fixture.selection.path,fixture.selection.sha256]])if(sha(fs.readFileSync(file))!==digest)throw Error('Compact fixture changed');
 const args=[fixture.binaryPath,'--headless','--no-prefs','--multicore','0','--fxp',fixture.selection.path,'--midi',fixture.midiPath,'--wav',path.join(root,'observed.wav'),'--rate','48000','--bit-depth','24','--dither','OFF'];
 if(JSON.stringify(args)!==JSON.stringify(launch.arguments))throw Error('Identical explicit compact render arguments required');
 const audio=fs.readFileSync(path.join(root,d.keyAudioFile));
 if(audio.length!==3314*3072||audio.length!==d.keyAudioBytes||sha(audio)!==d.keyAudioSha256)throw Error('Complete bound compact voice stream required');
 const clock=midiBlockClock(fs.readFileSync(fixture.midiPath),{sampleRate:48000,blockSize:64});
 if(clock.noteOns.length!==5)throw Error('Five compact MIDI voice starts required');
 const referenceRecords=new Map(reference.data.keyAudioRecords.map(r=>[r.epoch+':'+r.voiceBlockCounter,r]));
 const voices=new Map(),ages=new Map(),order=Array.from({length:2320},()=>[]);
 const heads=rows=>rows.map(({root,...rest})=>rest);
 d.keyAudioRecords.forEach((item,i)=>{
  const age=ages.get(item.epoch)??0,id=item.epoch+':'+age,block=(clock.noteOns[item.epoch]?.frame+age)/64;
  if(!Number.isInteger(block)||block<0||block>=2320||item.voiceBlockCounter!==age||item.nativeAge!==age+64||item.ordinal!==i||item.offset!==i*3072||item.bytes!==3072||voices.has(id)||sha(audio.subarray(item.offset,item.offset+3072))!==item.sha256)throw Error('Contiguous complete compact voice placement required');
  const spatial=Array.from({length:12},(_,r)=>Float32Array.from({length:64},(_,s)=>{
   const v=audio.readFloatLE(item.offset+(r*64+s)*4);if(!Number.isFinite(v))throw Error('Finite compact audio required');return v;
  }));
  const voice={keyIndex:item.keyIndex,mixLevels:item.mixLevels,monoContribution:item.monoContribution,mappings:item.mappings,groupGains:item.groupGains,selectionMask:item.selectionMask,spatial};
  const original=reference.voices.get(id),record=referenceRecords.get(id);
  if(!original||numericalHash(voice)!==numericalHash(original))throw Error('Compact premise rejected: keyed voice audio/routing differs at '+id);
  if(!record||numericalHash(heads(record.cacheHeads))!==numericalHash(heads(item.cacheHeads)))throw Error('Compact premise rejected: observed cache placement differs at '+id);
  voices.set(id,voice);ages.set(item.epoch,age+64);order[block].push(id);
 });
 if(ages.size!==5||voices.size!==reference.voices.size)throw Error('Identical complete compact voice inventory required');
 let changedOrderBlocks=0;
 order.forEach((ids,block)=>{
  if(JSON.stringify([...ids].sort())!==JSON.stringify([...reference.order[block]].sort()))throw Error('Compact premise rejected: within-block inventory differs');
  if(JSON.stringify(ids)!==JSON.stringify(reference.order[block]))changedOrderBlocks++;
 });
 const pcm=readPcm(path.join(root,'observed.wav'));
 if(!changedOrderBlocks||pcm.equals(reference.pcm))throw Error('Distinct compact order and native PCM required');
 return {root,fixture,runtimeSha256:sha(raw),order,voices,pcm,hasFullTargets:false,changedOrderBlocks,
  target(){return {}},states(){return null},writerTarget(){return null}};
}
