import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {GlobalRawKeys} from '../dsp/global-raw-keys.mjs';
import {bindMidiRawVelocitySource} from './pianoteq_midi_raw_velocity_source.mjs';
const [directory,archive,output,...flags]=process.argv.slice(2);
if(!output||flags.length>1||flags.some(x=>x!=='--poison-node-target')||fs.existsSync(output)||path.resolve(output).startsWith(path.resolve('.')+path.sep))throw Error('Usage: complete-private-run current-archive-source fresh-private-report [--poison-node-target]');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),runtime=fs.readFileSync(path.join(directory,'runtime.json')),data=JSON.parse(runtime),launch=JSON.parse(fs.readFileSync(path.join(directory,'launch.json')));
if(!data.runStatus?.terminal||data.runStatus.exitStatus!==0||data.errors.length||data.downstreamErrors.length||data.targetMutation!==false)throw Error('Complete successful source capture required');
const bytes=fs.readFileSync(path.join(directory,data.driveLevelFile)),raw=JSON.parse(bytes);
if(sha(bytes)!==data.driveLevelSha256||!raw.runStatus?.terminal||raw.runStatus.exitStatus!==0||raw.runStatus.pid!==data.runStatus.pid||raw.errors.length||raw.pending||raw.records.length!==2320||raw.warmups.length!==1)throw Error('Bound complete same-process raw-key capture required');
const source=bindMidiRawVelocitySource(archive),m=source.metadata,fixture=launch.fixture;
if(m.midiSha256!==fixture.midiSha256||m.presetSha256!==fixture.selection.sha256||m.resourceSha256!==fixture.resourceSha256)throw Error('Identical raw lifecycle archive/MIDI fixture required');
const indices=[...new Set(data.keyAudioRecords.map(x=>x.keyIndex))];if(indices.length!==1)throw Error('Explicit played-key mapping required');
const driver=source.createLifecycle(raw.initial.rawKeys,indices[0]),own=new GlobalRawKeys(driver.initialState(raw.initial.rawKeys));
const stages={},failures=[],nodeHash=crypto.createHash('sha256'),keyHash=crypto.createHash('sha256');let poisoned=false;
const word=Buffer.alloc(4),bits=x=>{word.writeFloatLE(x);return word.readUInt32LE()};
const compare=(stage,p,a,context)=>{const s=stages[stage]??={checks:0,mismatches:0};s.checks++;if(bits(p)!==bits(a)){s.mismatches++;if(failures.length<15)failures.push({stage,...context})}};
function compareNodes(stage,nodes,targets,frame,key){
 compare(stage+':count',nodes.length,targets.length,{frame,key});
 nodes.forEach((n,j)=>{const t=targets[j];if(!t)return;
  for(const field of ['id','tag','velocity','position','intermediate']){
   let target=t[field];if(flags.length&&!poisoned&&field==='id'&&n.id===0){target=1;poisoned=true;}
   compare(stage+':'+field,n[field],target,{frame,key,node:j});
  }
 });
}
for(const [i,item]of [raw.warmups[0],...raw.records].entries()){
 const frame=i===0?0:(i-1)*64,snapshot=driver.before(item.rawBefore,frame,{warmup:i===0});
 snapshot.keys.forEach((k,key)=>compareNodes('before',k.nodes,item.rawBefore.keys[key].nodes,frame,key));
 const result=own.process(snapshot,i===0?{timeStep:0}:{});driver.after(own);
 driver.nodes.forEach((nodes,key)=>{compareNodes('after',nodes,item.rawAfter.keys[key].nodes,frame,key);for(const n of nodes)nodeHash.update(JSON.stringify([key,n.id,n.tag,n.velocity,n.position,n.intermediate])+'\n');});
 result.values.forEach((value,key)=>{compare('raw-key',value,item.input[key],{frame,key});word.writeFloatLE(value);keyHash.update(word)});
}
if(flags.length&&!poisoned)throw Error('Node identity target not exercised');
const report={schema:1,sourceRuntimeSha256:sha(runtime),rawDataSha256:sha(bytes),source:source.metadata,...driver.summary(),stages,failures,computedNodeSha256:nodeHash.digest('hex'),computedRawKeysSha256:keyHash.digest('hex'),mismatches:Object.values(stages).reduce((n,s)=>n+s.mismatches,0),poisonedTarget:poisoned,independentStereoVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));if(report.mismatches)process.exitCode=1;
