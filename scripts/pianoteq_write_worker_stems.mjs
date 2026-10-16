// Export computed internal groups for listening; these are not microphone/stereo output.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function writeWorkerStems(report,directory,sampleRate){
 if(!report.passed||!report.workerOutputs||!report.continuousModalStatesCarried||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('Verified computed worker output and explicit sample rate required');
 const files=[];
 // Validate and construct every file before creating the destination.
 for(const {epoch,blocks} of report.voiceBlockCounts){
  const rows=report.continuousOutputs.filter(row=>row.epoch===epoch);
  if(!blocks||rows.length!==blocks||rows.some((row,i)=>row.counter!==i*64||row.channels.length!==rows[0].channels.length||row.channels.some(c=>c.length!==64)))throw new Error('Complete contiguous voice output required');
  for(let group=0;group<rows[0].channels.length;group++){
   const frames=blocks*64,pcm=Buffer.alloc(frames*4);let offset=0,peak=0,squares=0;
   for(const row of rows)for(const value of row.channels[group]){
    if(!Number.isFinite(value)||!Object.is(value,Math.fround(value)))throw new Error('Finite exact float32 samples required');
    pcm.writeFloatLE(value,offset);offset+=4;peak=Math.max(peak,Math.abs(value));squares+=value*value;
   }
   const header=Buffer.alloc(58);
   header.write('RIFF',0);header.writeUInt32LE(50+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(18,16);
   header.writeUInt16LE(3,20);header.writeUInt16LE(1,22);header.writeUInt32LE(sampleRate,24);header.writeUInt32LE(sampleRate*4,28);
   header.writeUInt16LE(4,32);header.writeUInt16LE(32,34);header.writeUInt16LE(0,36);
   header.write('fact',38);header.writeUInt32LE(4,42);header.writeUInt32LE(frames,46);header.write('data',50);header.writeUInt32LE(pcm.length,54);
   files.push({name:`voice-${epoch}-group-${group}.wav`,data:Buffer.concat([header,pcm]),epoch,group,frames,peak,rms:Math.sqrt(squares/frames),pcmSha256:crypto.createHash('sha256').update(pcm).digest('hex')});
  }
 }
 if(files.length!==15)throw new Error('Current verified experiment requires five voices and three groups');
 fs.mkdirSync(directory,{recursive:false});
 const manifest={sampleRate,format:'IEEE float32 mono',normalization:false,finalStereo:false,computedSamples:true,observedModelAndControlInputsRemain:true,description:'Independent computed internal modal groups, including prefetched blocks. No microphone, soundboard or final stereo mix is implied.',files:files.map(({data,...metadata})=>metadata)};
 for(const {name,data} of files)fs.writeFileSync(path.join(directory,name),data,{flag:'wx'});
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return {directory,...manifest};
}
