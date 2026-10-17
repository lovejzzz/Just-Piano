import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const [capturePath,reportPath,directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw new Error('Usage: capture.json passed-report.json new-directory');
const data=JSON.parse(fs.readFileSync(capturePath)),report=JSON.parse(fs.readFileSync(reportPath));
if(!data.complete||data.errors.length||!data.timeSpatialComponent||!report.passed||report.mismatches||!report.timeToSpatialSameRun||report.blocks!==5*data.windowBlocks)throw new Error('Passed joint time/spatial capture required');
const rate=data.records.find(r=>r.stage==='selection').source.sampleRate;if(!Number.isInteger(rate)||rate<8000||rate>192000)throw new Error('Explicit sample rate required');
const files=[];
for(let epoch=0;epoch<5;epoch++){
 const targets=data.records.filter(r=>r.stage==='expanded'&&r.epoch===epoch),predictions=new Map(report.predictions.filter(r=>r.epoch===epoch).map(r=>[r.counter,r]));
 if(targets.length!==data.windowBlocks||predictions.size!==targets.length||targets.some((r,i)=>r.counter!==i*64))throw new Error('From-zero output coverage required');
 for(const kind of ['group','auxiliary'])for(let group=0;group<(kind==='group'?3:1);group++)for(let row=0;row<3;row++){
  const pcm=Buffer.alloc(targets.length*64*4),word=Buffer.alloc(4),expected=Buffer.alloc(4);let offset=0;
  for(const r of targets){const p=predictions.get(r.counter),a=(kind==='group'?r.groups[group].values:r.auxiliary.values)[row],g=(kind==='group'?p.spatialGroups[group]:p.auxiliary)[row];
   if(a.length!==64||g.length!==64)throw new Error('Complete expanded rows required');
   for(let i=0;i<64;i++){if(!Number.isFinite(g[i])||!Object.is(Math.fround(g[i]),g[i]))throw new Error('Finite float32 output required');word.writeFloatLE(g[i]);expected.writeFloatLE(a[i]);if(!word.equals(expected))throw new Error('Predicted spatial sample differs from target');pcm.writeFloatLE(g[i],offset);offset+=4;}
  }
  const frames=pcm.length/4,h=Buffer.alloc(58);h.write('RIFF',0);h.writeUInt32LE(50+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(18,16);h.writeUInt16LE(3,20);h.writeUInt16LE(1,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*4,28);h.writeUInt16LE(4,32);h.writeUInt16LE(32,34);h.write('fact',38);h.writeUInt32LE(4,42);h.writeUInt32LE(frames,46);h.write('data',50);h.writeUInt32LE(pcm.length,54);
  files.push({name:`voice-${epoch}-expanded-${kind}-${group}-${row}.wav`,epoch,kind,group,row,frames,firstCounter:0,pcmSha256:crypto.createHash('sha256').update(pcm).digest('hex'),data:Buffer.concat([h,pcm])});
 }
}
fs.mkdirSync(directory);for(const f of files)fs.writeFileSync(path.join(directory,f.name),f.data,{flag:'wx'});
const manifest={endpoint:'expanded',sampleRate:rate,format:'IEEE float32 mono',computedSamples:true,normalization:false,timeToSpatialSameRun:true,spatialRingsInitializedToZero:true,observedAudioInput:true,spatialCoefficientsObserved:true,expDoubleCandidateUsed:report.expDoubleCandidateUsed,globalTimeFieldsFromArchive:report.globalTimeFieldsFromArchive,fullVoiceSourceComputed:false,finalStereo:false,files:files.map(({data,...m})=>m)};
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({files:files.length,samples:files.reduce((n,f)=>n+f.frames,0),finalStereo:false}));
