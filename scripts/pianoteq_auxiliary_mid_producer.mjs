import {archiveReleaseWaveform} from './pianoteq_archive_release_waveform.mjs';
import {generateAuxiliaryBank} from '../dsp/auxiliary-generated-bank.mjs';
import {selectAuxiliarySource} from '../dsp/auxiliary-source-selection.mjs';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {VoiceReleaseCue64} from '../dsp/voice-release-cue.mjs';
import {AuxiliarySourceEnvelope64} from '../dsp/auxiliary-source-envelope.mjs';
import {midiBlockClock} from '../dsp/midi-block-clock.mjs';
import {readPcm} from './pianoteq_order_fixture.mjs';
export function produceAuxiliaryMidSource(directory,{poisonAudioTarget=false,archiveSourcePath,poisonReleaseWaveTarget=false,generatedSelections,poisonGeneratedWaveTarget=false,poisonGeneratedSelectionTarget=false}={}) {
const flags=poisonAudioTarget?['--poison-audio-target']:[];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const runtimeBytes = fs.readFileSync(path.join(directory, 'runtime.json')), d = JSON.parse(runtimeBytes);
if (!d.runStatus?.terminal || d.runStatus.exitStatus !== 0 || d.targetMutation !== false || d.hardwareBreakpoints !== 2 ||
    d.activeHardwareBreakpoints !== 1 || !d.alternatingSites || d.errors.length || d.pending !== null ||
    d.inputs.length !== 3314 || d.outputs.length !== 3314 || d.transitions.length !== 6628 || Object.keys(d.profiles).length !== 5)
  throw Error('Complete successful auxiliary source capture required');
const launch = JSON.parse(fs.readFileSync(path.join(directory, 'launch.json')));
const fixture = launch.fixture;
const args = [fixture.binaryPath, '--headless', '--no-prefs', '--multicore', '0', '--fxp', fixture.selection.path,
  '--midi', fixture.midiPath, '--wav', path.join(directory, 'observed.wav'), '--rate', '48000', '--bit-depth', '24', '--dither', 'OFF'];
if (JSON.stringify(args) !== JSON.stringify(launch.arguments)) throw Error('Exact explicit primary render arguments required');
const nativePcm = readPcm(path.join(directory, 'observed.wav'));
if (nativePcm.length !== 148224 * 6) throw Error('Complete primary native stereo WAV required');
for (const [file, digest] of Object.entries(launch.helperSha256))
  if (sha(fs.readFileSync(path.join(directory, '..', file))) !== digest) throw Error('Frozen source collector changed');
for (const [file, digest] of [[launch.fixture.midiPath, launch.fixture.midiSha256], [launch.fixture.resourcePath, launch.fixture.resourceSha256],
  [launch.fixture.selection.path, launch.fixture.selection.sha256]]) if (sha(fs.readFileSync(file)) !== digest) throw Error('Fixture changed');
const archiveWave=archiveSourcePath?archiveReleaseWaveform(archiveSourcePath,fixture):null;
let generatedBank;
if(generatedSelections){
 if(!archiveWave||generatedSelections.length!==5||generatedSelections.some((r,i)=>r.epoch!==i||r.detunes?.length!==3))throw Error('Five continuously calculated three-row selections and archive release source required');
 const groups=JSON.parse(fs.readFileSync(archiveSourcePath)).baseFields.find(r=>r.object_offset===0x1e80).value.filter(g=>g.integer20===1);
 if(groups.length!==1)throw Error('One current kind1 generated bank required');generatedBank=generateAuxiliaryBank(groups[0]);
}
if((poisonGeneratedWaveTarget||poisonGeneratedSelectionTarget)&&!generatedBank)throw Error('Generated source bank required for target negative');
const tables = new Map();
for (const [key, table] of Object.entries(d.tables)) {
  const raw = fs.readFileSync(path.join(directory, table.file));
  if (raw.length !== table.count * 4 || sha(raw) !== table.sha256) throw Error('Complete bound source table required');
  tables.set(key, Float32Array.from({length: table.count}, (_, i) => raw.readFloatLE(i * 4)));
}
const audio = fs.readFileSync(path.join(directory, 'auxiliary.bin'));
if (audio.length !== 3314 * 1024 || audio.length !== d.audioBytes || sha(audio) !== d.audioSha256) throw Error('Complete auxiliary target audio required');
const clock = midiBlockClock(fs.readFileSync(fixture.midiPath), {sampleRate:48000,blockSize:64});
const releaseAges = clock.noteOns.map(on => {
  const off=clock.events.find(e=>e.kind==='noteOff'&&e.note===on.note&&e.channel===on.channel&&e.frame>=on.frame);
  if(!off)throw Error('Explicit MIDI note-off required');return off.frame-on.frame;
});
if(releaseAges.length!==5)throw Error('Five MIDI note events required');
const calculatedTables=generatedBank?new Map([...generatedBank].map(([k,v])=>[k,v.samples])):tables;
let generatedWaveChecks=0,generatedWaveMismatches=0,generatedWaveTargetPoisoned=false,generatedSelectionTargetPoisoned=false;const generatedSourceSelections=[];
const models = new Map(Object.entries(d.profiles).map(([epoch,rows])=>{
 const e=Number(epoch);
 const ownRows=generatedBank?rows.map((row,variant)=>{
  const selection=selectAuxiliarySource(generatedBank,{note:clock.noteOns[e].note,detune:generatedSelections[e].detunes[variant],variant});
  generatedSourceSelections.push({epoch:e,row:variant,...selection});
  for(const which of ['primary','secondary']){
   const own=selection[which]?calculatedTables.get(selection[which]):null;
   let target=row[which]?tables.get(row[which]):null;
   if(target&&poisonGeneratedSelectionTarget&&!generatedSelectionTargetPoisoned){
    const other=[...tables].find(([key,data])=>key!==row[which]&&data.length===target.length);
    if(!other)throw Error('Alternate selection comparison target required');target=other[1];generatedSelectionTargetPoisoned=true;
   }
   if(!own!==!target||own&&own.length!==target.length)throw Error('Generated source selection target extent differs');
   if(own)for(let i=0;i<own.length;i++){
    let value=target[i];if(poisonGeneratedWaveTarget&&!generatedWaveTargetPoisoned&&i===1){value=Math.fround(value+.125);generatedWaveTargetPoisoned=true;}
    generatedWaveChecks++;if(!Object.is(own[i],value))generatedWaveMismatches++;
   }
  }
  return {...row,primary:selection.primary,secondary:selection.secondary};
 }):rows;
 return [e,new AuxiliarySourceEnvelope64(ownRows,calculatedTables,{sampleRate:48000,initialScale:d.inputs.find(r=>r.epoch===e).envelope.scale,releaseAge:releaseAges[e],quietLimit:d.inputs.find(r=>r.epoch===e).controls.quietLimit,quietThreshold:d.inputs.find(r=>r.epoch===e).controls.quietThreshold})];
}));
let releaseWaveChecks=0,releaseWaveMismatches=0,releaseWaveTargetPoisoned=false;
const predictions=[],midControls=new Map(),cues=new Map(),preMidVoices=new Map();
const cancelAges=clock.noteOns.map((on,i)=>clock.noteOns.slice(i+1).filter(n=>n.note===on.note&&n.channel===on.channel).map(n=>n.frame-on.frame));
for(let epoch=0;epoch<5;epoch++){
 const start=d.inputs.find(r=>r.epoch===epoch&&r.counter===releaseAges[epoch]);
 if(!start||start.directSource.counter!==0||start.directSource.quiet!==0)throw Error('MIDI-aligned initial release cue configuration required');
 let profile=start.directSource,cueTables=tables;
 if(generatedBank&&profile.secondary)throw Error('Generated source contract currently requires a mono release cue');
 if(archiveWave){const target=tables.get(profile.primary);if(target.length!==archiveWave.output.length)throw Error('Archive release waveform extent differs');for(let i=0;i<target.length;i++){let t=target[i];if(poisonReleaseWaveTarget&&!releaseWaveTargetPoisoned&&i===1){t=Math.fround(t+0.125);releaseWaveTargetPoisoned=true;}releaseWaveChecks++;if(!Object.is(archiveWave.output[i],t))releaseWaveMismatches++;}cueTables=new Map(tables);cueTables.set('archive-release-primary',archiveWave.output);profile={...profile,primary:'archive-release-primary'};}
 cues.set(epoch,new VoiceReleaseCue64(profile,cueTables));
}
const extraComputed=Buffer.alloc(3314*256);
function cueState(model,target,context){
 check('cue:quiet',Number(model.quiet),target.quiet,context);
 if(target.quiet&1)return;
 check('cue:counter',model.counter,target.counter,context);
 if(model.events.length!==target.events.length)throw Error('Fixed release event inventory required');
 model.events.forEach((e,i)=>{
  const t=target.events[i];
  if(['offset','start','duration','gain'].some(k=>e[k]!==t[k])||e.coefficients.some((v,j)=>v!==t.coefficients[j]))throw Error('Fixed release event configuration required');
  e.history.forEach((v,j)=>check('cue:history',bits(v),bits(t.history[j]),{...context,event:i,word:j}));
 });
}
const f32 = new DataView(new ArrayBuffer(4)), bits = x => {f32.setFloat32(0, x, true); return f32.getUint32(0, true)};
const stages = {}, failures = [], computed = Buffer.alloc(3314*768);let poisoned = false;
function check(stage, p, a, context) {
  const s = stages[stage] ??= {checks: 0, mismatches: 0};s.checks++;
  if (p !== a) {s.mismatches++;if (failures.length < 20) failures.push({stage, predicted: p, actual: a, ...context})}
}
for (let ordinal = 0; ordinal < 3314; ordinal++) {
  const input = d.inputs[ordinal], target = d.outputs[ordinal], own = models.get(input.epoch), context = {ordinal, epoch: input.epoch, counter: input.counter};
  if (!own || own.sources.length !== 3 || input.profile.length !== 3 || target.epoch !== input.epoch || target.counter !== input.counter || target.offset !== ordinal * 1024 || target.bytes !== 1024 ||
      sha(audio.subarray(target.offset, target.offset + 1024)) !== target.sourceSha256) throw Error('Bound complete auxiliary interval required');
  const a = d.transitions[ordinal * 2], b = d.transitions[ordinal * 2 + 1];
  if (a.ordinal !== ordinal || b.ordinal !== ordinal + 1 || a.from !== '0x100301c8c' || a.to !== '0x100460c84' || b.from !== a.to || b.to !== a.from) throw Error('Exact exclusive source phases required');
  own.prepareEvent();
  check('quiet-before',own.quietCounter,input.controls.quietCounter,context);
  check('parent-skip-before',own.parentSkip,input.controls.parentSkip,context);
  if(own.quietLimit!==input.controls.quietLimit||own.quietThreshold!==input.controls.quietThreshold)throw Error('Fixed quiet profile required');
  for(const [k,v]of Object.entries(own.envelope))check('envelope-before:'+k,bits(v),bits(input.envelope[k]),context);
  own.sources.forEach((model, row) => {
    const config = d.profiles[input.epoch][row], observed = input.profile[row];
    if (model.age !== input.counter || ['delay', 'gain', 'primary', 'secondary'].some(k => JSON.stringify(config[k]) !== JSON.stringify(observed[k])) || observed.filters.length !== model.filters.length) throw Error('Fixed source configuration and continuous age required');
    check('started', Number(model.started), observed.flags[0], {...context, row});
    check('first-third', Number(model.pastFirstThird), observed.flags[1], {...context, row});
    model.filters.forEach((state, section) => {
      if (JSON.stringify(config.filters[section].slice(4)) !== JSON.stringify(observed.filters[section].slice(4))) throw Error('Fixed auxiliary filter coefficients required');
      state.history.forEach((v, i) => check('filter-history', bits(v), observed.filters[section][i], {...context, row, section, i}));
    });
  });
  if(input.mode!==0||input.auxProcessor!==0||input.fadedSource.quiet!==1||target.fadedSource.quiet!==1)throw Error('Supported source mode, auxiliary bypass and inactive faded cue required');
  const cue=cues.get(input.epoch),released=own.age>=releaseAges[input.epoch];
  if(released&&cancelAges[input.epoch].includes(own.age))cue.cancelPending();
  if(released){check('cue:selector',cue.counter,input.extraSelector,context);cueState(cue,input.directSource,context);}
  else check('cue:selector',input.extraSelector,-1,context);
  const extra=released?cue.process64():new Float32Array(64);
  if(released)cueState(cue,target.directSource,context);
  const rows=own.process64(input.controls);
  preMidVoices.set(input.epoch+':'+input.counter,rows.map(row=>Float32Array.from(row)));
  const gain=Math.fround(input.controls.midLevel*input.controls.auxiliaryMidGain);
  for(const row of rows)for(let i=0;i<64;i++)row[i]=Math.fround((own.parentSkip?row[i]:Math.fround(row[i]*gain))+extra[i]);
  extra.forEach((v,i)=>{extraComputed.writeFloatLE(v,ordinal*256+i*4);check('extra-audio',bits(v),audio.readUInt32LE(target.offset+768+i*4),{...context,sample:i});});
  if(input.controls.auxiliaryMidGain!==undefined){
    if(![input.controls.auxiliaryMidGain,input.controls.midLevel].every(Number.isFinite))throw Error('Finite captured auxiliary mid controls required');
    midControls.set(input.epoch+':'+input.counter,{gain:input.controls.auxiliaryMidGain,level:input.controls.midLevel,enabled:!(own.parentSkip&1)});
  }
  check('quiet-after',own.quietCounter,target.quietCounter,context);
  check('parent-skip-after',own.parentSkip,target.parentSkip,context);
  for(const [k,v]of Object.entries(own.envelope))check('envelope-after:'+k,bits(v),bits(target.envelope[k]),context);
  rows.forEach((row,r)=>row.forEach((value,i)=>{
    const at=ordinal*768+(r*64+i)*4;computed.writeFloatLE(value,at);let actual=audio.readUInt32LE(target.offset+(r*64+i)*4);
    if(flags.includes('--poison-audio-target')&&!poisoned&&value!==0){actual=(actual^1)>>>0;poisoned=true;}
    check('audio',bits(value),actual,{...context,row:r,sample:i});
  }));
  predictions.push({epoch:input.epoch,counter:input.counter,offset:ordinal*768,sha256:sha(computed.subarray(ordinal*768,(ordinal+1)*768))});
}
if (flags.includes('--poison-audio-target') && !poisoned) throw Error('Negative target was not exercised');
const report = {schema: 1, runtimeSha256: sha(runtimeBytes), nativeStatus: d.runStatus, blocks: 3314, samples: 3314*192, extraSamples:3314*64, computedExtraSha256:sha(extraComputed),
  nativePcmFrames: nativePcm.length / 6, nativePcmSha256: sha(nativePcm),
  stages, failures, mismatches: generatedWaveMismatches+releaseWaveMismatches+Object.values(stages).reduce((n, s) => n + s.mismatches, 0), computedAudioSha256: sha(computed),
  targetAudioSha256: sha(audio), historiesOwned: true, nativeAuxiliaryAudioUsedForPrediction: false, nativeExtraAudioUsedForPrediction:false, cueStartsFromMidi:true, cueHistoriesOwned:true, cueConfigurationStillObserved:true, fadedSourceVerifiedInactiveOnly:true,
  releaseCuePrimaryWaveformStillObserved:!archiveWave,archiveReleaseWaveform:archiveWave?.metadata,releaseWaveChecks,releaseWaveMismatches,releaseWaveTargetPoisoned,nativeSourceTablesStillObserved: true, initialSourceGainsDelayAndFilterCoefficientsStillObserved: true, initialEnvelopeScaleStillObserved:true, envelopeEnableFromMidi:true, envelopeDynamicStatesObserved:false, rawGainControlsStillObserved:true, quietCounterAndParentSkipOwned:true, initialQuietProfileStillObserved:true, releaseAges, predictions,
  independentMidiToStereoVerified: false, poisonedTarget: poisoned};
Object.assign(report,{generatedWaveChecks,generatedWaveMismatches,generatedWaveTargetPoisoned,generatedSelectionTargetPoisoned,
 generatedSourceSelections,generatedBankEntries:generatedBank?.size??0,
 nativeKind1WaveformsUsedForPrediction:!generatedBank,nativeKind1PointerSelectionUsedForPrediction:!generatedBank,
 nativeSourceTablesStillObserved:!generatedBank||!archiveWave,
 sourceSelectionFromMidiAndOwnDetunes:!!generatedBank,detuneInitializationControlsStillObserved:true,
 auxiliarySourceGainsIncludingInterpolationStillObserved:true});
const voices=new Map(predictions.map(item=>[item.epoch+':'+item.counter,Array.from({length:3},(_,r)=>Float32Array.from({length:64},(_,i)=>computed.readFloatLE(item.offset+(r*64+i)*4)))]));
const files=[path.join(directory,'runtime.json'),path.join(directory,'launch.json'),path.join(directory,'observed.wav'),path.join(directory,'auxiliary.bin'),fixture.midiPath,fixture.resourcePath,fixture.selection.path,
 ...(archiveWave?.dependencies??[]),...(archiveSourcePath?[archiveSourcePath]:[]),...Object.keys(launch.helperSha256).map(f=>path.join(directory,'..',f)),...Object.values(d.tables).map(t=>path.join(directory,t.file))];
return {report,computed,voices,preMidVoices,midControls,fixture,inputFiles:files.map(f=>({path:path.resolve(f),sha256:sha(fs.readFileSync(f))}))};
}
