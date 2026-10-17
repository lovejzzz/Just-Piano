// Only directly compared voice intervals; no claim of full stereo output.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export function writePostConsumerStems(data,report,directory){
if(!data.complete||!data.consumerPost||!report.passed||!report.sourceCommits||!report.injection?.passed||!report.injection.postMode||!report.injection.groupEnvelopeGainCarried)throw new Error('Passed joint source/post replay required');
const sampleRate=data.records.find(r=>r.stage==='weights').selectionSource.sampleRate;
if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('Explicit sample rate required');
const files=[];
for(let epoch=0;epoch<5;epoch++){
 const targets=data.records.filter(r=>r.stage==='consumerPost'&&r.epoch===epoch);
 if(!targets.length||targets.some((r,i)=>r.counter!==targets[0].counter+64*i))throw new Error('Contiguous directly observed suffix required');
 const predictions=new Map(report.injection.outputs.filter(r=>r.epoch===epoch).map(r=>[r.counter,r]));
 for(let group=0;group<3;group++){
  const pcm=Buffer.alloc(targets.length*64*4);let offset=0,peak=0,squares=0;
  const actual=Buffer.alloc(4),predicted=Buffer.alloc(4);
  for(const target of targets){
   const source=predictions.get(target.counter)?.channels[group];
   if(source?.length!==64||target.channels[group]?.length!==64)throw new Error('Missing compared group');
   for(let i=0;i<64;i++){
    const value=source[i];
    if(!Number.isFinite(value)||!Object.is(value,Math.fround(value)))throw new Error('Exact float32 prediction required');
    actual.writeFloatLE(target.channels[group][i]);predicted.writeFloatLE(value);
    if(!actual.equals(predicted))throw new Error('Predicted PCM differs from native post output');
    pcm.writeFloatLE(value,offset);offset+=4;peak=Math.max(peak,Math.abs(value));squares+=value*value;
   }
  }
  const frames=targets.length*64,header=Buffer.alloc(58);
  header.write('RIFF',0);header.writeUInt32LE(50+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(18,16);
  header.writeUInt16LE(3,20);header.writeUInt16LE(1,22);header.writeUInt32LE(sampleRate,24);header.writeUInt32LE(sampleRate*4,28);
  header.writeUInt16LE(4,32);header.writeUInt16LE(32,34);header.write('fact',38);header.writeUInt32LE(4,42);header.writeUInt32LE(frames,46);
  header.write('data',50);header.writeUInt32LE(pcm.length,54);
  files.push({name:`voice-${epoch}-post-group-${group}.wav`,data:Buffer.concat([header,pcm]),epoch,group,firstComparedCounter:targets[0].counter,frames,peak,rms:Math.sqrt(squares/frames),pcmSha256:crypto.createHash('sha256').update(pcm).digest('hex')});
 }
}
if(files.reduce((n,f)=>n+f.frames,0)!==report.injection.postOutputSamples)throw new Error('Post sample coverage differs from replay');
fs.mkdirSync(directory);
for(const file of files)fs.writeFileSync(path.join(directory,file.name),file.data,{flag:'wx'});
const allVoiceStartsAtZero=files.every(f=>f.firstComparedCounter===0);
const manifest={sampleRate,format:'IEEE float32 mono',computedSamples:true,normalization:false,comparedSuffixesOnly:!allVoiceStartsAtZero,allVoiceStartsAtZero,groupEnvelopeSeedObserved:report.injection.groupEnvelopeSeedObservedOnce,groupEnvelopeActivationComputed:report.injection.groupEnvelopeActivationComputed===true,finalStereo:false,observedModelAndControlInputsRemain:true,files:files.map(({data,...metadata})=>metadata)};
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
return {directory,...manifest};
}
