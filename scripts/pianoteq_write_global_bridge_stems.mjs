import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const [capturePath,reportPath,directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw new Error('Usage: complete-capture.json passed-report.json new-directory');
const data=JSON.parse(fs.readFileSync(capturePath)),report=JSON.parse(fs.readFileSync(reportPath));
if(!data.complete||data.errors.length||!data.timeSpatialRoutingGlobalComponent||!report.passed||report.mismatches||!report.sharedRowsToCabinetSameRun||report.globalBlocks!==data.globalFrames)throw new Error('Passed routed/global source chain required');
const targets=data.records.filter(r=>r.stage==='cabinet'),predictions=report.globalPredictions,rate=data.records.find(r=>r.stage==='selection').source.sampleRate;
if(!Number.isInteger(rate)||rate<8000||rate>192000||targets.length!==data.globalFrames||predictions.length!==targets.length||targets.some((r,i)=>r.globalBlock!==i||r.counter!==i*64))throw new Error('Complete from-zero global blocks required');
const files=[];
for(const [kind,rows] of [['source',9],['auxiliary',3],['before',3]])for(let row=0;row<rows;row++){
 const pcm=Buffer.alloc(targets.length*64*4),a=Buffer.alloc(4),b=Buffer.alloc(4);let offset=0;
 for(let i=0;i<targets.length;i++){
  const t=targets[i],p=predictions[i];if(p.globalBlock!==t.globalBlock||p.counter!==t.counter||p.sharedReadBlock!==t.sharedReadBlock||t[kind].rows!==rows||t[kind].samples!==64)throw new Error('Bound global prediction required');
  const actual=t[kind].values[row],computed=p[kind][row];if(actual.length!==64||computed.length!==64)throw new Error('Complete global row required');
  for(let j=0;j<64;j++){if(!Number.isFinite(computed[j])||!Object.is(Math.fround(computed[j]),computed[j]))throw new Error('Finite float32 samples required');a.writeFloatLE(actual[j]);b.writeFloatLE(computed[j]);if(!a.equals(b))throw new Error('Global sample differs from native');pcm.writeFloatLE(computed[j],offset);offset+=4;}
 }
 const frames=pcm.length/4,h=Buffer.alloc(58);h.write('RIFF',0);h.writeUInt32LE(50+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(18,16);h.writeUInt16LE(3,20);h.writeUInt16LE(1,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*4,28);h.writeUInt16LE(4,32);h.writeUInt16LE(32,34);h.write('fact',38);h.writeUInt32LE(4,42);h.writeUInt32LE(frames,46);h.write('data',50);h.writeUInt32LE(pcm.length,54);
 files.push({name:`global-cabinet-${kind}-${row}.wav`,kind,row,frames,firstGlobalBlock:0,pcmSha256:crypto.createHash('sha256').update(pcm).digest('hex'),data:Buffer.concat([h,pcm])});
}
fs.mkdirSync(directory);for(const f of files)fs.writeFileSync(path.join(directory,f.name),f.data,{flag:'wx'});
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({endpoint:'cabinet',sampleRate:rate,computedSamples:true,normalization:false,sharedRowsToCabinetSameRun:true,observedUpstreamAudio:true,globalRouteInputObserved:true,globalFeedbackObserved:true,boundedGlobalPrefix:true,finalStereo:false,files:files.map(({data,...m})=>m)},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({files:files.length,samples:files.reduce((n,f)=>n+f.frames,0),finalStereo:false}));
