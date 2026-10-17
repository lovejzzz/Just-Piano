import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const [capturePath,reportPath,directory,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||!directory||extra.length)throw new Error('Usage: complete-component.json passed-report.json new-directory');
const data=JSON.parse(fs.readFileSync(capturePath)),report=JSON.parse(fs.readFileSync(reportPath));
if(!data.complete||data.errors.length||!data.activeTimeComponent||!report.passed||report.mismatches||!report.timeChangedSamples||!report.postAttackBlocks||report.blocks!==5*data.windowBlocks)throw new Error('Passed active component with full bounded coverage required');
const sampleRate=data.records.find(r=>r.stage==='selection').source.sampleRate;if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('Explicit sample rate required');
const files=[];
for(let epoch=0;epoch<5;epoch++){
 const targets=data.records.filter(r=>r.stage==='time'&&r.epoch===epoch),predictions=new Map(report.predictions.filter(r=>r.epoch===epoch).map(r=>[r.counter,r]));
 if(targets.length!==data.windowBlocks||targets.some((r,i)=>r.counter!==i*64)||predictions.size!==targets.length)throw new Error('Complete from-zero time window required');
 for(const kind of ['group','auxiliary'])for(let row=0;row<3;row++){
  const pcm=Buffer.alloc(targets.length*64*4),expected=Buffer.alloc(4),actual=Buffer.alloc(4);let offset=0;
  for(const r of targets){const p=predictions.get(r.counter),a=(kind==='group'?r.channels:r.auxiliary.values)[row],g=(kind==='group'?p.channels:p.auxiliary)[row];
   if(a.length!==64||g.length!==64)throw new Error('Complete active rows required');
   for(let i=0;i<64;i++){if(!Number.isFinite(g[i])||!Object.is(Math.fround(g[i]),g[i]))throw new Error('Exact finite float32 output required');actual.writeFloatLE(a[i]);expected.writeFloatLE(g[i]);if(!actual.equals(expected))throw new Error('Active output differs from native target');pcm.writeFloatLE(g[i],offset);offset+=4;}
  }
  const frames=pcm.length/4,header=Buffer.alloc(58);header.write('RIFF',0);header.writeUInt32LE(50+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(18,16);header.writeUInt16LE(3,20);header.writeUInt16LE(1,22);header.writeUInt32LE(sampleRate,24);header.writeUInt32LE(sampleRate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(32,34);header.write('fact',38);header.writeUInt32LE(4,42);header.writeUInt32LE(frames,46);header.write('data',50);header.writeUInt32LE(pcm.length,54);
  files.push({name:`voice-${epoch}-active-time-${kind}-${row}.wav`,epoch,kind,group:row,frames,firstComparedCounter:0,pcmSha256:crypto.createHash('sha256').update(pcm).digest('hex'),data:Buffer.concat([header,pcm])});
 }
}
fs.mkdirSync(directory);for(const f of files)fs.writeFileSync(path.join(directory,f.name),f.data,{flag:'wx'});
const manifest={endpoint:'time',sampleRate,format:'IEEE float32 mono',computedSamples:true,normalization:false,matrixKinds:['group','auxiliary'],allVoiceStartsAtZero:true,terminalInitialEnvelopeStateObserved:false,terminalInitialTimeStateObserved:true,terminalAuxiliaryEntryObserved:true,observedAudioInput:true,expDoubleCandidateUsed:report.expDoubleCandidateUsed,boundedComponent:true,fullVoiceSourceComputed:false,finalStereo:false,files:files.map(({data,...metadata})=>metadata)};
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({files:files.length,samples:files.reduce((n,f)=>n+f.frames,0),finalStereo:false,observedAudioInput:true}));
