#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {generateSoundboardArchiveIRs} from '../dsp/soundboard-archive-ir.mjs';
const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath||process.argv.length!==4)throw new Error('Usage: private-archive-json NEW-private-output-directory');
const root=fileURLToPath(new URL('../',import.meta.url)),parent=fs.realpathSync(path.dirname(path.resolve(outputPath)));
const output=path.join(parent,path.basename(outputPath)),relative=path.relative(root,output);
if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))
  throw new Error('Commercial inputs and computed responses must remain outside the repository');
if(fs.existsSync(output))throw new Error('Fresh private output directory required');
const bytes=fs.readFileSync(inputPath),archive=JSON.parse(bytes),result=generateSoundboardArchiveIRs(archive);
// Generation finishes before any output is created. The only numerical input
// file read by this runner is the decoded archive; no native oracle is accepted.
fs.mkdirSync(output,{mode:0o700});
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const groups=result.groups.map(({outputs,...metadata})=>({...metadata,responses:outputs.map((samples,channel)=>{
  const file=`group-${metadata.component}-channel-${channel}.bin`,data=Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength);
  fs.writeFileSync(path.join(output,file),data,{flag:'wx',mode:0o600});
  return {file,bytes:data.length,length:samples.length,sha256:digest(data)};
})}));
const manifest={schema:1,sourceArchiveSha256:digest(bytes),groups,nativeCapturesUsedForPrediction:false,
  nativeTargetBuffersUsedForPrediction:false,numericalInputFileCount:1,completeVoiceVerified:false,finalStereoAudioVerified:false};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({groups:groups.length,responses:groups.reduce((n,g)=>n+g.responses.length,0),
  values:groups.reduce((n,g)=>n+g.responses.reduce((s,r)=>s+r.length,0),0),sourceArchiveSha256:manifest.sourceArchiveSha256,
  nativeCapturesUsedForPrediction:false,completeVoiceVerified:false,finalStereoAudioVerified:false}));
