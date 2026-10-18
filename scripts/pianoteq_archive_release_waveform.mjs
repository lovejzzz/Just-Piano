import fs from 'node:fs';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {createSoundboardResamplingPlan,resampleSoundboardResponse} from '../dsp/soundboard-resampling.mjs';
export function archiveReleaseWaveform(archiveSourcePath,fixture) {
 const helper=fileURLToPath(new URL('./pianoteq_decode_release_resource.py',import.meta.url));
 const result=spawnSync('python3',[helper,archiveSourcePath],{encoding:'utf8',maxBuffer:4*1024*1024});
 if(result.status!==0||result.error)throw Error('Current archive release decode failed: '+result.stderr);
 const decoded=JSON.parse(result.stdout);
 if(decoded.resourceSha256!==fixture.resourceSha256)throw Error('Identical release waveform resource required');
 const b=Buffer.from(decoded.pcm,'base64'),input=Float32Array.from({length:b.length/4},(_,i)=>b.readFloatLE(i*4));
 const plan=createSoundboardResamplingPlan(Math.fround(48000/decoded.record.rate),10);
 const output=resampleSoundboardResponse(input,plan);
 return {...output,dependencies:decoded.dependencies,metadata:{...decoded,pcm:undefined,dependencies:undefined,quality:10,logicalFrames:output.frames,storageSamples:output.output.length}};
}
