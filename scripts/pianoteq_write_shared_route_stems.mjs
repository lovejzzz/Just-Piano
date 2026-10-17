import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const [capturePath,reportPath,directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw new Error('Usage: complete-capture.json passed-report.json new-directory');
const data=JSON.parse(fs.readFileSync(capturePath)),report=JSON.parse(fs.readFileSync(reportPath));
if(!data.complete||data.errors.length||!data.timeSpatialRoutingComponent||!report.passed||report.mismatches||!report.sharedContributionBatches||!report.spatialToRoutingSameRun||report.sharedReadFrames!==data.readBlocks)throw new Error('Passed complete shared-route source chain required');
const rate=data.records.find(r=>r.stage==='selection').source.sampleRate;if(!Number.isInteger(rate)||rate<8000||rate>192000)throw new Error('Explicit sample rate required');
const labels=['aux','group0','group1','group2'],files=[];
for(let index=0;index<4;index++){
 const targets=data.records.filter(r=>r.stage==='readReturn'&&r.index===index),predictions=report.routedPredictions.filter(r=>r.index===index);
 if(targets.length!==data.readBlocks||predictions.length!==targets.length||targets.some((r,i)=>r.readBlock!==i||r.counter!==i*64))throw new Error('Continuous shared-cache output required');
 for(let row=0;row<3;row++){
  const pcm=Buffer.alloc(targets.length*64*4),a=Buffer.alloc(4),b=Buffer.alloc(4);let offset=0;
  for(let i=0;i<targets.length;i++){
   const t=targets[i],p=predictions[i];if(p.readBlock!==t.readBlock||p.root!==t.root||JSON.stringify(p.contributors)!==JSON.stringify(t.contributors)||p.label!==labels[index]||t.matrix.rows!==3||t.matrix.samples!==64)throw new Error('Bound shared-cache prediction required');
   const actual=t.matrix.values[row],computed=p.rows[row];if(actual.length!==64||computed.length!==64)throw new Error('Complete shared-route row required');
   for(let j=0;j<64;j++){if(!Number.isFinite(computed[j])||!Object.is(Math.fround(computed[j]),computed[j]))throw new Error('Finite float32 samples required');a.writeFloatLE(actual[j]);b.writeFloatLE(computed[j]);if(!a.equals(b))throw new Error('Shared-route sample mismatch');pcm.writeFloatLE(computed[j],offset);offset+=4;}
  }
  const frames=pcm.length/4,h=Buffer.alloc(58);h.write('RIFF',0);h.writeUInt32LE(50+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(18,16);h.writeUInt16LE(3,20);h.writeUInt16LE(1,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*4,28);h.writeUInt16LE(4,32);h.writeUInt16LE(32,34);h.write('fact',38);h.writeUInt32LE(4,42);h.writeUInt32LE(frames,46);h.write('data',50);h.writeUInt32LE(pcm.length,54);
  files.push({name:`shared-route-${labels[index]}-${row}.wav`,index,label:labels[index],row,frames,firstReadBlock:0,pcmSha256:crypto.createHash('sha256').update(pcm).digest('hex'),data:Buffer.concat([h,pcm])});
 }
}
fs.mkdirSync(directory);for(const f of files)fs.writeFileSync(path.join(directory,f.name),f.data,{flag:'wx'});
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({endpoint:'readReturn',sampleRate:rate,computedSamples:true,normalization:false,sharedContributionBatches:true,spatialToRoutingSameRun:true,observedAudioInput:true,routingTablesObserved:true,cacheInitialHeadObserved:true,finalStereo:false,files:files.map(({data,...m})=>m)},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({files:files.length,samples:files.reduce((n,f)=>n+f.frames,0),finalStereo:false}));
