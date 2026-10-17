// Private component verification audio. Upstream primary/table inputs observed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [capturePath,reportPath,directory,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||!directory||extra.length)throw new Error('Usage: complete-capture.json passed-report.json new-directory');
const capture=JSON.parse(fs.readFileSync(capturePath)),report=JSON.parse(fs.readFileSync(reportPath));
if(!capture.complete||!report.passed||report.mismatches||!report.statesCarried||!report.coefficientsComputed||!report.observationResumes)throw new Error('Verified complete Rattle replay required');
const targets=new Map(capture.records.filter(r=>r.stage==='after').map(r=>[`${r.epoch}:${r.counter}`,r]));
const sampleRate=capture.records.find(r=>r.stage==='before')?.state.controls.sampleRate,files=[];let total=0;
if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('Explicit sample rate required');
for(let epoch=0;epoch<5;epoch++){
 const rows=report.outputs.filter(r=>r.epoch===epoch),pcm=Buffer.alloc(rows.length*64*4),actual=Buffer.alloc(4);let offset=0,peak=0,squares=0;
 if(!rows.length)throw new Error('Five complete component voices required');
 for(const [i,row] of rows.entries()){
  if(row.counter!==i*64||row.samples.length!==64)throw new Error('Contiguous component output required');
  const target=targets.get(`${epoch}:${row.counter}`);if(target?.output.length!==64)throw new Error('Native output target missing');
  row.samples.forEach((value,j)=>{
   if(!Number.isFinite(value)||!Object.is(value,Math.fround(value)))throw new Error('Exact float32 samples required');
   pcm.writeFloatLE(value,offset);actual.writeFloatLE(target.output[j]);
   if(!actual.equals(pcm.subarray(offset,offset+4)))throw new Error('Computed PCM differs from observed component output');
   offset+=4;peak=Math.max(peak,Math.abs(value));squares+=value*value;
  });
 }
 const frames=rows.length*64,header=Buffer.alloc(58);total+=frames;
 header.write('RIFF',0);header.writeUInt32LE(50+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(18,16);
 header.writeUInt16LE(3,20);header.writeUInt16LE(1,22);header.writeUInt32LE(sampleRate,24);header.writeUInt32LE(sampleRate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(32,34);
 header.write('fact',38);header.writeUInt32LE(4,42);header.writeUInt32LE(frames,46);header.write('data',50);header.writeUInt32LE(pcm.length,54);
 files.push({name:`voice-${epoch}-rattle-component.wav`,data:Buffer.concat([header,pcm]),epoch,frames,peak,rms:Math.sqrt(squares/frames),pcmSha256:crypto.createHash('sha256').update(pcm).digest('hex')});
}
if(total!==report.outputSamples||targets.size!==report.blocks)throw new Error('Complete component sample coverage required');
fs.mkdirSync(directory);
for(const file of files)fs.writeFileSync(path.join(directory,file.name),file.data,{flag:'wx'});
const manifest={sampleRate,format:'IEEE float32 mono',normalization:false,computedComponentSamples:true,upstreamPrimaryInputObserved:report.primaryInputObserved,upstreamCrossInputObserved:report.midInputObserved===true,groupGainComputed:report.midToRattleInputComputed===true,sourceTableObserved:true,fullIndependentVoice:false,finalStereo:false,files:files.map(({data,...metadata})=>metadata)};
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({files:files.length,totalComparedSamples:total}));
