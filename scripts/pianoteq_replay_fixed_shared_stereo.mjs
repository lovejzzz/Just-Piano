// Experimental fixed-site whole-clip verifier. Observed source/control boundaries remain explicit.
// Same-run time-envelope -> spatial tail; upstream audio is still observed.
import fs from 'node:fs';
import {readCapture} from './pianoteq_capture_jsonl.mjs';
import {CabinetConvolution64} from '../dsp/cabinet-convolution.mjs';
import {DryStereoPost64} from '../dsp/dry-stereo-post.mjs';
import {encodeObservedPcm24} from '../dsp/pcm24.mjs';
import {GlobalRoutedMix64} from '../dsp/global-routed-mix.mjs';
import {injectWorkspaceFeedback} from '../dsp/workspace-feedback.mjs';
import {createRoutedDelayCache,routeConstantBlock,readRoutedBlock} from '../dsp/routed-delay-cache.mjs';
import {combineThenRestoreGroups,distributeAuxiliary} from '../dsp/voice-spatial-output.mjs';
import crypto from 'node:crypto';
import path from 'node:path';
import {archiveTimeEnvelopeAtKnot} from '../dsp/archive-time-envelope.mjs';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
import {initializeTerminalVoiceEnvelope,renderTerminalVoiceEnvelope,renderVoiceTimeEnvelope} from '../dsp/voice-tail-envelopes.mjs';
const [capturePath,auditPath,reportPath,...flags]=process.argv.slice(2);
const diagnosticRejectedCapture=flags.includes('--diagnostic-rejected-capture');
if(diagnosticRejectedCapture)flags.splice(flags.indexOf('--diagnostic-rejected-capture'),1);
const option=flags.includes('--exp-candidate')?'--exp-candidate':null,extra=flags.filter(x=>x.startsWith('--archive-time-source=')),pcmOptions={};
for(const flag of flags){if(flag==='--exp-candidate'||flag.startsWith('--archive-time-source='))continue;const i=flag.indexOf('=');const key=flag.slice(0,i),value=flag.slice(i+1);if(i<0||!['--observed-wav','--reference-wav','--output-wav'].includes(key)||pcmOptions[key]||!value)throw new Error('Invalid full-stereo option');pcmOptions[key]=value;}
if(!pcmOptions['--observed-wav']||!pcmOptions['--reference-wav'])throw new Error('Full native/reference WAVs required');
if(!capturePath||!auditPath||!reportPath||option!=='--exp-candidate'||extra.length>1||extra.length&&!extra[0].startsWith('--archive-time-source='))throw new Error('Usage: complete-component.json owned-resumes.jsonl new-report.json --exp-candidate [--archive-time-source=decoded-source.json]');
const archive=extra.length?JSON.parse(fs.readFileSync(extra[0].slice('--archive-time-source='.length))):null;
if(archive){
 if(archive.schema!==1||archive.presetSha256!==crypto.createHash('sha256').update(fs.readFileSync(archive.presetPath)).digest('hex'))throw new Error('Verified archive time preset required');
 if(!fs.readFileSync(path.join(path.dirname(capturePath),'commands.lldb'),'utf8').includes('--fxp '+archive.presetPath+' --midi '))throw new Error('Exact archive capture preset required');
}
import {initializeSpatialSleep,renderSpatialWithSleep} from '../dsp/voice-spatial-sleep.mjs';
const data=await readCapture(capturePath),resumes=fs.readFileSync(auditPath,'utf8').trim().split('\n').map(x=>JSON.parse(x));
if(!data.complete||data.errors?.length||!data.fixedSharedStereo||data.siteCount!==6||data.pending||data.voices!==5||data.activeSites!==0||data.globalPending!==null||data.handoffPending!==null||data.transitions.length!==2)throw new Error('Complete fixed-site capture required');
const driverFailures=fs.readdirSync(path.dirname(capturePath)).filter(n=>n.startsWith('driver-failure-'));
const captureAccepted=driverFailures.length===0;
if(!captureAccepted&&!diagnosticRejectedCapture)throw new Error('Inspected driver failures cannot become clean full-capture proof');
if(diagnosticRejectedCapture&&captureAccepted)throw new Error('Diagnostic rejection mode requires retained driver failure evidence');
if(diagnosticRejectedCapture){
 const entries=fs.readFileSync(path.join(path.dirname(capturePath),'inspected-diagnostic-resumes.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
 if(entries.length!==driverFailures.length||new Set(entries.map(e=>e.snapshot)).size!==driverFailures.length)throw new Error('Every rejected stop requires one explicit diagnostic Continue audit');
 for(const e of entries){const failure=JSON.parse(fs.readFileSync(path.join(path.dirname(capturePath),e.snapshot)));if(!driverFailures.includes(e.snapshot)||e.stopId!==failure.stopId||e.noTargetWrites!==true||e.noObservationBackfilled!==true||failure.errors.length||failure.details.length!==1||failure.details[0].reason!==6||JSON.stringify(failure.details[0].ids)!=='[6,1,0]')throw new Error('Unverified diagnostic stop');}
}
const points={irCopy:0x1002a4334,before:0x10030c104,key:0x10051fad4,global:0x1006c2fd4,cabinet:0x1000ef37c,pcm:0x1001bc114,selection:0x1007181d8,voiceExit:0x10085ede4};
const registry=new Map(['irCopy','before','key','global','cabinet','pcm'].map((s,i)=>[i+1,s])),audited=new Set();
let lastStop=-1;
for(const a of resumes){if(!Number.isInteger(a.stopId)||a.stopId<=lastStop)throw new Error('Ordered Continue audit required');lastStop=a.stopId;for(const t of a.threads){const s=t.lastOwned;if(s&&[s.fileAddress,s.fileAddress+4].includes(Number(t.pc))&&s.stopId<=a.stopId)audited.add(`${t.thread}:${s.id}:${s.stopId}`);}}
let handoff=0,maxId=6,sourceCount=0;
for(let i=0;i<data.records.length;i++){
 const r=data.records[i];if(registry.get(r.site?.id)!==r.stage||r.site.fileAddress!==points[r.stage]||!audited.has(`${r.thread}:${r.site.id}:${r.site.stopId}`))throw new Error('Unaudited fixed-site record');
 if(r.stage==='selection')sourceCount++;
 const t=data.transitions[handoff];if(t?.afterRecord===i+1){
  const expected=handoff===0?['irCopy','selection']:['selection','voiceExit'];
  if(t.oldRole!==expected[0]||t.newRole!==expected[1]||registry.get(t.oldId)!==t.oldRole||t.newId<=maxId||t.fileAddress!==points[t.newRole]||t.stopId!==r.site.stopId||t.registered!==6||t.active!==6||(handoff===0?(r.stage!=='cabinet'||r.globalBlock!==0):(r.stage!=='selection'||sourceCount!==5)))throw new Error('Invalid initialization handoff');
  registry.delete(t.oldId);registry.set(t.newId,t.newRole);maxId=t.newId;handoff++;
 }
}
if(handoff!==2||sourceCount!==5)throw new Error('Both initialization handoffs required');
let checks=0,mismatches=0,doubleChecks=0,context=null;const failures=[];
const view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Finite component floats required');view.setFloat32(0,x);return view.getUint32(0);};
const check=(name,p,a,double=false)=>{checks++;if(double)doubleChecks++;if(double?!Object.is(p,a):bits(p)!==bits(a)){mismatches++;if(failures.length<40)failures.push({name,predicted:p,actual:a,context});}};
const exact=(name,p,a)=>check(name,Number(p===a),1);
function compareTime(p,a){for(const k of ['enabled','delay','attack','decay','counter'])exact('time:'+k,p[k],a[k]);for(const k of ['attackRate','decayRate','value'])check('time:'+k,p[k],a[k],true);}
function compareTerminal(p,a){for(const part of ['primary','secondary'])for(const k of Object.keys(p[part]))check(part+':'+k,p[part][k],a[part][k]);compareTime(p.time,a.time);}
function matrices(name,p,a){if(p?.length!==3||a?.length!==3)throw new Error('Three aligned rows required');for(let r=0;r<3;r++){if(p[r].length!==64||a[r].length!==64)throw new Error('Aligned 64-sample rows required');for(let i=0;i<64;i++)check(name,p[r][i],a[r][i]);}}
function changed(a,b){let n=0;for(let r=0;r<3;r++)for(let i=0;i<64;i++)if(bits(a[r][i])!==bits(b[r][i]))n++;return n;}
const word32=new DataView(new ArrayBuffer(4));const fromBits=x=>{word32.setUint32(0,x);return word32.getFloat32(0);};
function spatialState(s){
 if(s.rows?.length!==3||s.fade.counter!==0)throw new Error('Three initialized spatial rows required');
 const rows=s.rows.map(row=>{
  if(row.tapWords.length!==20||row.words[4]!==row.words[5]*4)throw new Error('Five-tap spatial source required');
  const taps=Array.from({length:5},(_,i)=>({start:row.tapWords[i*4],end:row.tapWords[i*4+1],c:fromBits(row.tapWords[i*4+2]),g:fromBits(row.tapWords[i*4+3])}));
  const state={vectors:row.words[5],counter:taps[0].end,taps,ring:new Float32Array(row.words[4])};
  if(!row.ring||row.ring.length!==state.ring.length)throw new Error('Observed initial ring required');
  row.ring.forEach((v,i)=>check('initial-spatial-ring',state.ring[i],v));return state;
 });
 const sleep=initializeSpatialSleep(s.sleep.threshold);
 return {rows,fade:{...s.fade},model:structuredClone(s),sleep};
}
function compareSpatial(own,r){
 const s=r.spatial,v=own.spatial;if(!s||s.rows.length!==3||s.rowGains.slice(0,3).length!==3||s.rowGains.slice(0,3).some(g=>g!==1)||s.controls['0x29f8']!==0||s.controls['0x29fc']!==0)throw new Error('Unsupported spatial level or nonlinearity');
 for(const [k,val] of Object.entries({'0x88':1,'0xb0':1,'0xbc':1,'0xbd':0,'0xfc':1}))if(s.flags[k]!==val)throw new Error('Unsupported spatial branch');
 for(const k of Object.keys(v.model.controls))check('spatial-control:'+k,v.model.controls[k],s.controls[k]);
 for(const k of ['start','duration','secondsPerSample'])check('spatial-fade:'+k,v.fade[k],s.fade[k]);
 exact('spatial-fade-counter',v.fade.counter,s.fade.counter);
 exact('sleep-threshold',v.sleep.threshold,s.sleep.threshold);
 for(let g=0;g<3;g++){exact('sleep-input',v.sleep.inputCounters[g],s.sleep.inputCounters[g]);exact('sleep-output',v.sleep.outputCounters[g],s.sleep.outputCounters[g]);}
 s.rows.forEach((row,j)=>{exact('spatial-counter',v.rows[j].counter,row.words[8]);if(JSON.stringify(row.tapWords)!==JSON.stringify(v.model.rows[j].tapWords))throw new Error('Changing spatial taps unsupported');if(row.ring){if(row.ring.length!==v.rows[j].ring.length)throw new Error('Complete spatial ring required');row.ring.forEach((n,i)=>check('spatial-ring',v.rows[j].ring[i],n));}});
}
function compareGroups(name,p,actual){if(p.length!==3||actual?.length!==3)throw new Error('Three output groups required');for(let g=0;g<3;g++){const a=actual[g];if(a.rows!==p[g].length||a.samples!==64||a.values.length!==p[g].length)throw new Error('Complete spatial matrix required');for(let row=0;row<p[g].length;row++){if(a.values[row].length!==64)throw new Error('Complete spatial samples required');for(let i=0;i<64;i++)check(name,p[g][row][i],a.values[row][i]);}}}
function metadata(cache,actual){
 if(cache.rings.length!==actual.rings.length)throw new Error('Cache row count changed');
 check('cache-sample-rate',cache.sampleRate,actual.sampleRate);check('cache-max-delay',cache.maximumDelay,actual.maximumDelay);
 for(let i=0;i<cache.rings.length;i++){
  const p=cache.rings[i],a=actual.rings[i];for(const k of ['smallChunk','bigChunk','total','head'])exact('cache:'+k,p[k],a[k]);
  if(p.flags.length!==a.flags.length)throw new Error('Cache flag count changed');p.flags.forEach((v,j)=>exact('cache-validity',v,a.flags[j]));
 }
}
function routingEntries(entries){return entries.map(e=>{if(e.tapWords.length!==6)throw new Error('Exactly one routing tap required');const w=e.tapWords.map(fromBits);return {...e,taps:[{delay:w[0],startGain:w[1],endGain:w[2],multiplier:w[4]}]};});}
function pcmData(path){
 const wav=fs.readFileSync(path);let fmt,audio;if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw new Error('WAV required');
 for(let p=12;p+8<=wav.length;){const n=wav.readUInt32LE(p+4),id=wav.toString('ascii',p,p+4);if(p+8+n>wav.length)throw new Error('Truncated WAV');if(id==='fmt ')fmt=wav.subarray(p+8,p+8+n);if(id==='data')audio=wav.subarray(p+8,p+8+n);p+=8+n+(n&1);}
 if(!fmt||fmt.readUInt16LE(0)!==1||fmt.readUInt16LE(2)!==2||fmt.readUInt32LE(4)!==48000||fmt.readUInt16LE(14)!==24||!audio)throw new Error('Stereo 48kHz PCM24 required');return audio;
}
const nativePcm=pcmData(pcmOptions['--observed-wav']),referencePcm=pcmData(pcmOptions['--reference-wav']),pcmParts=[];
if(data.globalFrames!==data.wrapperBlocksExpected||nativePcm.length!==data.globalFrames*64*6||referencePcm.length!==nativePcm.length)throw new Error('Complete wrapper and WAV lengths must agree');
const configEntries=Object.entries(data.configs);if(configEntries.length!==1)throw new Error('One same-run cabinet configuration required');
const [cabinetState,cfg]=configEntries[0],copies=new Map();
for(const r of data.records)if(r.stage==='irCopy'){if(![64,512].includes(r.size)||r.values.length!==r.size||!r.values.every(Number.isFinite))throw new Error('Complete observed IR copy required');copies.set(`${r.size}:${r.object}`,r.values);}
if(copies.size!==data.irTimeInputCount)throw new Error('IR copy source inventory differs');
for(const [name,size]of [['head',64],['tail',512]])for(const ring of cfg[name].configuration.kernels){if(!ring)continue;for(const slot of ring.slots)if(!slot.empty){const source=copies.get(`${size}:${slot.object}`);if(!source||slot.timeInput.length!==2*size)throw new Error('IR time source not bound to observed copy');for(let i=0;i<2*size;i++)check('IR-time-copy-binding',i<size?source[i]:0,slot.timeInput[i]);}}
const convolution=new CabinetConvolution64(cfg.head.configuration,cfg.tail.configuration),post=new DryStereoPost64(cfg.post);let kernelSpectra=0,pcmCalibrationDifferences=0,headProducts=0,tailProducts=0;
for(const [name,bank]of [['head',convolution.head],['tail',convolution.tail.model]]){const c=cfg[name].configuration;for(let row=0;row<9;row++)for(let i=0;i<c.kernels[row].slots.length;i++){const native=c.kernels[row].slots[i];if(native.empty)continue;const computed=bank.kernels[row].slots[i].data;if(computed.length!==native.data.length)throw new Error('IR spectrum target length differs');for(let j=0;j<computed.length;j++)check('IR-spectrum',computed[j],native.data[j]);kernelSpectra++;}}

const states=new Map(),pending=new Map(),caches=new Map();let globalContext=null,globalFrame=0,globalMix=null,globalIdentity=null,globalTable=null,cacheRoots=null,sourceDataPointer=null;
let voiceBlocks=0,routedVoiceBlocks=0,unroutedVoiceBlocks=0,skippedVoiceExits=0,primaryActiveBlocks=0,secondaryActiveBlocks=0,postAttackBlocks=0,sleepAllInactive=0,sleepMixed=0;
function source(r){
 if(r.counter!==0||r.epoch!==states.size||states.has(r.epoch))throw new Error('Unique age-zero selection required');
 const s={...r.source};
 if(archive){const m=archiveTimeEnvelopeAtKnot({editFields:archive.editFields,note:r.note});for(const k of ['globalAttack','legatoAttack']){check('archive:'+k,m[k],s[k]);s[k]=m[k];}}
 if(!Object.values(s).every(Number.isFinite)||s.sampleRate<=0||r.initialTime.counter!==0)throw new Error('Finite source and age-zero time state required');
 let selected=Math.fround(s.overrideDuration!==0?s.overrideDuration:s.globalAttack);if(s.legato>0)selected=Math.fround(s.legatoAttack);
 const enabled=s.globalDelay!==0||selected!==0||s.globalEnd<10?1:0;
 if(!enabled||selected<0||s.globalDelay!==0||s.globalEnd<10)throw new Error('Unverified time initialization branch');
 const samples=Math.trunc(Math.fround(selected*Math.fround(s.sampleRate)));if(samples>0xffffffff)throw new Error('Time duration outside uint32');
 const time={...r.initialTime,enabled,delay:0,attack:samples,decay:0,counter:0,attackRate:samples?Math.exp(-0.9942522733438669/samples):0,decayRate:1};
 states.set(r.epoch,{voice:r.voice,age:0,sampleRate:s.sampleRate,time,selected});
}
function before(r,own){
 if(r.counter!==own.age||pending.has(r.thread)||globalContext||r.tail.special||r.auxiliary?.rows!==3||r.auxiliary.samples!==64)throw new Error('Contiguous supported voice input required');
 if(!own.terminal){own.terminal={};for(const part of ['primary','secondary'])own.terminal[part]=initializeTerminalVoiceEnvelope(own.sampleRate,r.tail[part].slope,r.tail[part].scale);}
 for(const part of ['primary','secondary'])own.terminal[part].enabled=r.tail[part].enabled;
 compareTerminal({...own.terminal,time:own.time},r.tail);
 if(!own.spatial)own.spatial=spatialState(r.spatial);compareSpatial(own,r);
 let result={groups:r.channels.map(g=>Float32Array.from(g)),auxiliary:r.auxiliary.values.map(g=>Float32Array.from(g))};
 if(r.tail.secondaryEnabled===1){result=renderTerminalVoiceEnvelope(result.groups,result.auxiliary,own.terminal.secondary);secondaryActiveBlocks++;}
 if(r.counter>r.tail.activationAge&&!(own.terminal.primary.enabled&1))own.terminal.primary.enabled=1;
 if(own.terminal.primary.enabled||own.terminal.primary.gain!==1)primaryActiveBlocks++;
 result=renderTerminalVoiceEnvelope(result.groups,result.auxiliary,own.terminal.primary);
 if(own.time.counter>=own.time.delay+own.time.attack+own.time.decay)postAttackBlocks++;
 result=renderVoiceTimeEnvelope(result.groups,result.auxiliary,own.time);
 const merged=combineThenRestoreGroups(result.groups),spatial=renderSpatialWithSleep(merged.groups,own.spatial.rows,own.spatial.fade,own.spatial.sleep);
 if(spatial.allInactive)sleepAllInactive++;if(spatial.mixed)sleepMixed++;
 const split=distributeAuxiliary(spatial.output[0],result.auxiliary,own.spatial.model.controls['0x94']);
 pending.set(r.thread,{epoch:r.epoch,counter:r.counter,B:r.B,groups:[split.primary,...spatial.output.slice(1)],auxiliary:split.auxiliary,exitSeen:false});voiceBlocks++;
}
function endpoint(r,own,p){
 if(!p||p.epoch!==r.epoch||p.counter!==r.counter||r.nativeAge!==r.counter+64)throw new Error('Bound voice output and native age required');
 compareTerminal({...own.terminal,time:own.time},r.tail);compareSpatial(own,r);compareGroups('voice-spatial-output',p.groups,r.groups);matrices('voice-auxiliary-output',p.auxiliary,r.auxiliary.values);
}
function close(r,own){own.age=r.counter+64;pending.delete(r.thread);}
for(const r of data.records){
 context={stage:r.stage,epoch:r.epoch,counter:r.counter,globalBlock:r.globalBlock};
 if(r.stage==='irCopy')continue;
 if(r.stage==='selection'){source(r);continue;}
 if(['before','voiceExit','key'].includes(r.stage)){
  const own=states.get(r.epoch);if(!own||own.voice!==r.voice||r.globalBlock!==globalFrame)throw new Error('Bound native voice required');
  if(r.stage==='before'){before(r,own);continue;}
  const p=pending.get(r.thread);
  if(r.stage==='voiceExit'){
   const willRoute=!!((r.returnFlag&1)||r.forcedActive);exact('voice-route-return',willRoute,r.willRoute);
   if(!r.rendered){if(p||willRoute||r.nativeAge!==own.age)throw new Error('Unverified route without rendered source');skippedVoiceExits++;continue;}
   endpoint(r,own,p);if(p.exitSeen)throw new Error('Duplicate voice exit');p.exitSeen=true;
   if(!willRoute){close(r,own);unroutedVoiceBlocks++;}continue;
  }
  endpoint(r,own,p);
  if(p.exitSeen!==(states.size===5)||r.selectionMask.length!==3||r.selectionMask.some(v=>v!==1)||r.roots.length!==4||r.caches.length!==4||r.mappings.length!==4||r.gains.length!==4||r.B!==p.B||JSON.stringify(r.roots)!==JSON.stringify(cacheRoots))throw new Error('Unverified key route shape');
  if(registry.size!==6)throw new Error('Six-site registry required');
  for(let i=0;i<4;i++){
   const cache=caches.get(r.roots[i]);if(!cache)throw new Error('Initial global cache observation required');metadata(cache,r.caches[i]);
   if(r.gains[i]!==1||![0,1].includes(r.mappings[i].wrap))throw new Error('Unverified outer route gain');
   routeConstantBlock(cache,i===0?p.auxiliary:p.groups[i-1],routingEntries(r.mappings[i].entries),r.gains[i],!!r.mappings[i].wrap);
  }
  close(r,own);routedVoiceBlocks++;continue;
 }
 if(r.stage==='global'){
  if(pending.size||globalContext||r.globalBlock!==globalFrame||r.feedbackPreRoute!==0||r.maskEnabled!==0||r.rowFlags.length!==3||r.input.rows!==2||r.input.samples!==64||r.sumInput.rows!==3||r.sumInput.samples!==64||r.gain!==1||![0,1].includes(r.mapping.wrap))throw new Error('Contiguous supported global frame required');
  const identity=JSON.stringify([r.M,r.B,r.R,r.S,r.keyRoots]);if(globalIdentity===null)globalIdentity=identity;else if(identity!==globalIdentity)throw new Error('Global owner or key cache identity changed');
  let outputs;
  if(globalFrame===0){
   cacheRoots=r.keyRoots;if(cacheRoots.length!==4||new Set(cacheRoots).size!==4||r.keyCaches.length!==4||states.size)throw new Error('Four initial pre-note cache states required');
   for(let i=0;i<4;i++){const seed=r.keyCaches[i];if(seed.root!==cacheRoots[i]||seed.rings.length!==3||seed.rings.some(row=>row.head!==64))throw new Error('Inspected post-first-read initial cache heads required');caches.set(cacheRoots[i],createRoutedDelayCache(seed));}
   outputs=Array.from({length:4},()=>Array.from({length:3},()=>new Float32Array(64)));
  }else outputs=cacheRoots.map((root,i)=>{const cache=caches.get(root),out=readRoutedBlock(cache);metadata(cache,r.keyCaches[i]);return out;});
  const table=JSON.stringify(r.mapping);if(!globalMix){globalMix=new GlobalRoutedMix64(r.cache,routingEntries(r.mapping.entries),!!r.mapping.wrap);globalTable=table;}else if(table!==globalTable)throw new Error('Changing global mapping unsupported');
  metadata(globalMix.cache,r.cache);
  const mix=globalMix.process64(r.input.values,r.sumInput.values,0,r.rowFlags),injected=injectWorkspaceFeedback(outputs.slice(1),r.sumInput.values,r.feedbackGain);
  globalContext={M:r.M,B:r.B,mix,injected,auxiliary:outputs[0],phase:'global'};continue;
 }
 if(r.stage==='cabinet'){
  const c=globalContext;if(!c||c.phase!=='global'||r.globalBlock!==globalFrame||r.cabinetState!==cabinetState||r.mode!==1||r.source.rows!==9||r.source.samples!==64||r.source.values.length!==9||r.before.rows!==3||r.before.samples!==64||r.auxiliary.rows!==3||r.auxiliary.samples!==64||r.gain.length!==4)throw new Error('Bound cabinet input required');
  // matrix.pointer is the sample buffer, not the descriptor. The frozen collector
  // asserts actual x2 == B+0x288 at every cabinet stop; no past address is backfilled.
  if(r.source.rowStride!==64||r.source.stride!==9)throw new Error('Contiguous nine-row cabinet sample buffer required');
  if(sourceDataPointer===null)sourceDataPointer=r.source.pointer;
  exact('cabinet-sample-buffer',r.source.pointer,sourceDataPointer);
  for(let i=0;i<4;i++)check('cabinet-gain',[1,1,0,0][i],r.gain[i]);
  for(let j=0;j<9;j++){if(r.source.values[j].length!==64)throw new Error('Complete source row required');for(let i=0;i<64;i++)check('computed-cabinet-source',c.injected.flat[j][i],r.source.values[j][i]);}
  matrices('computed-cabinet-before',c.mix.output,r.before.values);matrices('computed-cabinet-auxiliary',c.auxiliary,r.auxiliary.values);
  const result=convolution.process64(c.injected.flat,c.mix.output,r.mode);headProducts+=result.headProducts;if(result.tailWork)tailProducts+=result.tailWork.products;
  c.stereo=post.process64(result.output,c.auxiliary).output;c.phase='cabinet';continue;
 }
 if(r.stage==='pcm'){
  const c=globalContext;if(!c||c.phase!=='cabinet'||r.globalBlock!==globalFrame||r.cabinetState!==cabinetState||r.output.rows!==2||r.output.samples!==64||r.output.values.length!==2||r.level.length!==4)throw new Error('Bound final stereo stage required');
  for(let j=0;j<4;j++)check('output-level',cfg.post.level[j],r.level[j]);
  for(let j=0;j<2;j++){if(r.output.values[j].length!==64)throw new Error('Complete stereo row required');for(let i=0;i<64;i++)check('final-stereo',c.stereo[j][i],r.output.values[j][i]);}
  pcmParts.push(Buffer.from(encodeObservedPcm24(c.stereo)));const calibrated=Buffer.from(encodeObservedPcm24(r.output.values)),offset=globalFrame*64*6;
  for(let i=0;i<calibrated.length;i+=3)if(calibrated.readIntLE(i,3)!==nativePcm.readIntLE(offset+i,3))pcmCalibrationDifferences++;
  globalContext=null;globalFrame++;continue;
 }
 throw new Error('Unknown fixed-site record');
}
if(globalContext||pending.size||globalFrame!==data.globalFrames||states.size!==5||!voiceBlocks||voiceBlocks!==routedVoiceBlocks+unroutedVoiceBlocks||!postAttackBlocks)throw new Error('Full native voice/global coverage required');
for(const own of states.values())exact('final-voice-age',own.age,data.ends[BigInt(own.voice).toString()]);
const pcm=Buffer.concat(pcmParts);if(pcm.length!==nativePcm.length)throw new Error('Complete PCM length required');let pcmDifferences=0,referencePcmDifferences=0;
for(let i=0;i<pcm.length;i+=3){if(pcm.readIntLE(i,3)!==nativePcm.readIntLE(i,3))pcmDifferences++;if(pcm.readIntLE(i,3)!==referencePcm.readIntLE(i,3))referencePcmDifferences++;}
if(pcmOptions['--output-wav']){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(pcm.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(2,22);h.writeUInt32LE(48000,24);h.writeUInt32LE(288000,28);h.writeUInt16LE(6,32);h.writeUInt16LE(24,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);fs.writeFileSync(pcmOptions['--output-wav'],Buffer.concat([h,pcm]),{flag:'wx'});}
const diagnosticSameRunMathMatches=!mismatches&&!pcmDifferences&&!pcmCalibrationDifferences;
const sameRunPassed=captureAccepted&&diagnosticSameRunMathMatches;
const report={passed:sameRunPassed&&!referencePcmDifferences,sameRunPassed,captureAccepted,diagnosticRejectedCapture,driverFailureCount:driverFailures.length,diagnosticSameRunMathMatches,checks,mismatches,doubleChecks,fullPcmFrames:pcm.length/6,pcmDifferences,referencePcmDifferences,pcmCalibrationDifferences,kernelSpectra,headProducts,tailProducts,voiceBlocks,routedVoiceBlocks,unroutedVoiceBlocks,skippedVoiceExits,primaryActiveBlocks,secondaryActiveBlocks,postAttackBlocks,sleepAllInactive,sleepMixed,globalFrames:globalFrame,initialCacheHeadObserved:true,initialSilentOutputsAssumedAndCheckedAtCabinet:true,cabinetDescriptorObservedInRecords:false,cabinetDescriptorAssertedByFrozenCollector:true,cabinetSampleBufferIdentityCarried:true,observedVoiceInput:true,observedModelAndEnableInputs:true,observedSpatialCoefficients:true,observedGlobalInputAndFeedback:true,observedIrSourceAndPlans:true,expDoubleCandidateUsed:true,fullVoiceSourceComputed:false,finalStereoAudioVerified:sameRunPassed&&!referencePcmDifferences,failures};
fs.writeFileSync(reportPath,stringifyWithNegativeZero(report,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
