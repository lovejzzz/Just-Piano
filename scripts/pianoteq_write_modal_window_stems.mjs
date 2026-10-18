// Export only the directly compared first-voice modal window.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const [captureFile,reportFile,directory,...extra]=process.argv.slice(2);
if(!captureFile||!reportFile||!directory||extra.length)throw new Error('Usage: private-capture.json verified-report.json new-private-directory');
const repository=path.dirname(path.dirname(fileURLToPath(import.meta.url))),destination=path.join(fs.realpathSync(path.dirname(path.resolve(directory))),path.basename(directory)),relative=path.relative(repository,destination);
if(relative===''||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)))throw new Error('Commercial audio must remain outside repository');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const captureBytes=fs.readFileSync(captureFile),d=JSON.parse(captureBytes),reportBytes=fs.readFileSync(reportFile),r=JSON.parse(reportBytes),log=fs.readFileSync(path.join(path.dirname(captureFile),'lldb.log'));
if(/could not read|corrupt (?:FXP file|archive)/i.test(log.toString())||d.runStatus?.terminal!==true||d.runStatus.exitStatus!==0||!Array.isArray(d.errors)||d.errors.length||d.complete!==true)throw new Error('Complete error-free native run required');
if(r.captureSha256!==sha(captureBytes)||r.passed!==true||r.boundedWindow!==true||r.workerOutputs!==false||r.continuousModalStatesCarried!==true||r.dampingControlsFromArchive!==true||r.positionAndRolloffControlsObserved!==false||r.initialPositionWeightsObserved!==false||r.initialPositionWeightsComputed!==true)throw new Error('Bound independently computed position-window replay required');
if(!Number.isInteger(r.windowBlocks)||r.windowBlocks<1||r.windowBlocks>512||r.windowEnd!==64*r.windowBlocks)throw new Error('Explicit consistent bounded audio window required');
const state=r.finalVoiceStates.find(x=>x.epoch===0),controls=r.dampingModels.find(x=>x.epoch===0);
if(!state?.positionWeightsReady||!controls?.extraCurve||controls.position>=.125||r.windowEnd<=64*state.positionWeightWarmupBlocks)throw new Error('Compared window must include initialized low-position weights after warmup');
const activeWeights=d.records.find(x=>x.stage==='coefficients'&&x.epoch===0&&Number.isInteger(x.counter)&&x.counter>=0&&x.counter<r.windowEnd&&Number.isFinite(x.actual?.gain)&&x.actual.gain!==0);
if(!activeWeights)throw new Error('Audio window must include nonzero position-weight gain');
const targets=d.records.filter(x=>x.stage==='copy'&&x.epoch===0&&x.render),own=r.continuousOutputs,sampleRate=d.records.find(x=>x.stage==='weights').selectionSource.sampleRate;
if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||targets.length!==r.windowBlocks||own.length!==targets.length||r.continuousOutputSamples!==targets.length*3*64)throw new Error('Complete bounded audio coverage required');
const files=[];
for(let group=0;group<3;group++){
 const frames=targets.length*64,pcm=Buffer.alloc(frames*4),actual=Buffer.alloc(4);let offset=0;
 for(let block=0;block<targets.length;block++){
  if(targets[block].counter!==block*64||own[block].counter!==block*64)throw new Error('Contiguous counter-zero audio required');
  const native=targets[block].render.channels[group],predicted=own[block].channels[group];
  if(native.length!==64||predicted.length!==64)throw new Error('Complete modal block required');
  for(let i=0;i<64;i++){
   if(!Number.isFinite(predicted[i])||!Object.is(predicted[i],Math.fround(predicted[i])))throw new Error('Finite exact float32 output required');
   pcm.writeFloatLE(predicted[i],offset);actual.writeFloatLE(native[i]);
   if(!actual.equals(pcm.subarray(offset,offset+4)))throw new Error('Computed PCM differs from native audio');
   offset+=4;
  }
 }
 const header=Buffer.alloc(58);header.write('RIFF',0);header.writeUInt32LE(50+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(18,16);header.writeUInt16LE(3,20);header.writeUInt16LE(1,22);header.writeUInt32LE(sampleRate,24);header.writeUInt32LE(sampleRate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(32,34);header.write('fact',38);header.writeUInt32LE(4,42);header.writeUInt32LE(frames,46);header.write('data',50);header.writeUInt32LE(pcm.length,54);
 files.push({name:`voice-0-window-group-${group}.wav`,frames,pcmSha256:sha(pcm),bytes:Buffer.concat([header,pcm])});
}
const manifest={sampleRate,format:'IEEE float32 mono',normalization:false,finalStereo:false,wholeVoiceTailVerified:false,computedSamples:true,nativeSamplesComparedDirectly:true,observedModelAndControlInputsRemain:true,windowBlocks:r.windowBlocks,positionWeightWarmupBlocks:state.positionWeightWarmupBlocks,positionWeightsReady:true,positionWeightActiveFromCounter:activeWeights.counter,captureSha256:sha(captureBytes),reportSha256:sha(reportBytes),nativeLogSha256:sha(log),files:files.map(({bytes,...metadata})=>metadata)};
fs.mkdirSync(directory);for(const f of files)fs.writeFileSync(path.join(directory,f.name),f.bytes,{flag:'wx',mode:0o600});fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({...manifest,float32Samples:targets.length*64*3}));
