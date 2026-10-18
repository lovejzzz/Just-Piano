import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {GlobalRawKeys} from '../dsp/global-raw-keys.mjs';
import {bindMidiRawVelocitySource} from './pianoteq_midi_raw_velocity_source.mjs';
const [directory,archive,output,...flags]=process.argv.slice(2);
if(!output||flags.length>1||flags.some(x=>x!=='--poison-velocity-target')||fs.existsSync(output)||path.resolve(output).startsWith(path.resolve('.')+path.sep))throw Error('Usage: complete-private-run current-archive-source fresh-private-report [--poison-velocity-target]');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const runtime=fs.readFileSync(path.join(directory,'runtime.json')),data=JSON.parse(runtime);
if(!data.runStatus?.terminal||data.runStatus.exitStatus!==0||data.errors.length||data.downstreamErrors.length||data.targetMutation!==false)throw Error('Complete successful source capture required');
const bytes=fs.readFileSync(path.join(directory,data.driveLevelFile)),raw=JSON.parse(bytes);
if(sha(bytes)!==data.driveLevelSha256||!raw.runStatus?.terminal||raw.runStatus.exitStatus!==0||raw.runStatus.pid!==data.runStatus.pid||raw.errors.length||raw.pending||raw.records.length!==2320||raw.warmups.length!==1)throw Error('Bound complete same-process raw-key capture required');
const source=bindMidiRawVelocitySource(archive),indices=[...new Set(data.keyAudioRecords.map(x=>x.keyIndex))];
if(indices.length!==1)throw Error('Explicit single played-key mapping required');
const driver=source.create(raw.initial.rawKeys,indices[0]);
const cold=structuredClone(raw.initial.rawKeys);for(const key of cold.keys)for(const node of key.nodes){node.position=0;node.intermediate=0;}
const own=new GlobalRawKeys(cold),velocityHash=crypto.createHash('sha256'),keyHash=crypto.createHash('sha256');
const stages={},failures=[];let poisoned=false;
const word=Buffer.alloc(4),bits=x=>{word.writeFloatLE(x);return word.readUInt32LE()};
const compare=(stage,p,a,context)=>{const s=stages[stage]??={checks:0,mismatches:0};s.checks++;if(bits(p)!==bits(a)){s.mismatches++;if(failures.length<15)failures.push({stage,...context})}};
for(const [i,item]of [raw.warmups[0],...raw.records].entries()){
 const frame=i===0?0:(i-1)*64,snapshot=item.rawBefore,velocities=driver.velocitiesFor(snapshot,frame);
 snapshot.keys.forEach((key,k)=>key.nodes.forEach(node=>{
  const v=velocities.get(node.object);let target=node.velocity;
  if(flags.length&&!poisoned&&!driver.initial.has(node.object)){word.writeFloatLE(target);word.writeUInt32LE((word.readUInt32LE()^1)>>>0);target=word.readFloatLE();poisoned=true;}
  compare('node-velocity',v,target,{frame,key:k});word.writeFloatLE(v);velocityHash.update(word);
 }));
 const result=own.process(snapshot,{nodeVelocities:velocities,...(i===0?{timeStep:0}:{})});
 result.values.forEach((value,k)=>{compare('raw-key',value,item.input[k],{frame,key:k});word.writeFloatLE(value);keyHash.update(word)});
}
if(flags.length&&!poisoned)throw Error('Dynamic velocity target not exercised');
const report={schema:1,sourceRuntimeSha256:sha(runtime),rawDataSha256:sha(bytes),source:source.metadata,...driver.summary(),stages,failures,
 computedVelocitySha256:velocityHash.digest('hex'),computedRawKeysSha256:keyHash.digest('hex'),mismatches:Object.values(stages).reduce((n,s)=>n+s.mismatches,0),poisonedTarget:poisoned,independentStereoVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));if(report.mismatches)process.exitCode=1;
