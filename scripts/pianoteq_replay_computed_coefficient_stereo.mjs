import {bindMidiRawVelocitySource} from './pianoteq_midi_raw_velocity_source.mjs';
import {loadCompactOrderFixture} from './pianoteq_compact_order_fixture.mjs';
// Diagnostic only: observed voice endpoints/control production remain inputs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { GlobalRawKeys } from '../dsp/global-raw-keys.mjs';
import { ObservedVoiceStereo64 } from '../dsp/observed-voice-stereo.mjs';
import { encodeObservedPcm24 } from '../dsp/pcm24.mjs';
import { readComputedVoiceEndpoints } from './pianoteq_computed_voice_artifact.mjs';
import { loadOrderFixture, sha, numericalHash } from './pianoteq_order_fixture.mjs';

const [directory, reportPath, packPath, drivePath, sourceDirectory, ...flags] = process.argv.slice(2);
const velocitySourceFlags=flags.filter(x=>x.startsWith('--midi-raw-velocity-source='));
const orderFlags=flags.filter(x=>x.startsWith('--order-from=')),compactOrderFlags=flags.filter(x=>x.startsWith('--compact-order-from='));
const voiceReportFlags = flags.filter(x => x.startsWith('--voice-report=')), voiceAudioFlags = flags.filter(x => x.startsWith('--voice-audio='));
if (!drivePath || !sourceDirectory || velocitySourceFlags.length>1 || orderFlags.length+compactOrderFlags.length>1 || (orderFlags.length+compactOrderFlags.length)&&flags.includes('--alter-pedal-input') || voiceReportFlags.length > 1 || voiceAudioFlags.length > 1 || voiceReportFlags.length !== voiceAudioFlags.length || flags.some(x => x !== '--poison-pcm-target' && x !== '--poison-coefficient-target' && x !== '--alter-pedal-input' && !x.startsWith('--voice-report=') && !x.startsWith('--voice-audio=') && !x.startsWith('--order-from=') && !x.startsWith('--compact-order-from=') && !x.startsWith('--midi-raw-velocity-source=')) || new Set(flags).size !== flags.length || fs.existsSync(reportPath) ||
    path.resolve(reportPath).startsWith(path.resolve('.') + path.sep))
  throw Error('Usage: complete-private-run fresh-private-report independent-ir-pack static-drive-profile complete-private-coefficient-source [--poison-pcm-target|--poison-coefficient-target|--alter-pedal-input] [--order-from=complete-private-run|--compact-order-from=complete-private-compact-run] [--midi-raw-velocity-source=current-private-archive-inputs]');
const midiRawVelocitySource=velocitySourceFlags.length?bindMidiRawVelocitySource(velocitySourceFlags[0].slice('--midi-raw-velocity-source='.length)):null;
const fixture = loadOrderFixture(directory,{midiRawVelocitySource}), packBytes = fs.readFileSync(packPath), driveBytes = fs.readFileSync(drivePath);
const pack = JSON.parse(packBytes), driveProfile = JSON.parse(driveBytes);
const targetFixture=orderFlags.length?loadOrderFixture(orderFlags[0].slice('--order-from='.length),{midiRawVelocitySource}):compactOrderFlags.length?loadCompactOrderFixture(compactOrderFlags[0].slice('--compact-order-from='.length),fixture):fixture;
const compactTarget=targetFixture.hasFullTargets===false;
let changedOrderBlocks=0;
if(targetFixture!==fixture&&!compactTarget){
 if(numericalHash(fixture.fixture)!==numericalHash(targetFixture.fixture)||numericalHash(fixture.profile)!==numericalHash(targetFixture.profile)||numericalHash(fixture.controls)!==numericalHash(targetFixture.controls)||numericalHash(fixture.writers)!==numericalHash(targetFixture.writers)||fixture.voices.size!==targetFixture.voices.size)throw Error('Order-only premise rejected: numerical configuration or controls differ');
 for(const [id,voice]of fixture.voices)if(!targetFixture.voices.has(id)||numericalHash(voice)!==numericalHash(targetFixture.voices.get(id)))throw Error('Order-only premise rejected: keyed voice differs at '+id);
 fixture.order.forEach((ids,block)=>{
  if(JSON.stringify([...ids].sort())!==JSON.stringify([...targetFixture.order[block]].sort()))throw Error('Order-only premise rejected: block inventory differs');
  if(JSON.stringify(ids)!==JSON.stringify(targetFixture.order[block]))changedOrderBlocks++;
 });
 if(!changedOrderBlocks||fixture.pcm.equals(targetFixture.pcm))throw Error('Distinct native order and PCM required');
}
const computedVoiceSource = voiceReportFlags.length ? readComputedVoiceEndpoints(voiceReportFlags[0].slice('--voice-report='.length),voiceAudioFlags[0].slice('--voice-audio='.length),fixture.fixture) : null;
if (computedVoiceSource) {
  if (computedVoiceSource.voices.size !== fixture.voices.size) throw Error('Identical complete voice inventory required');
  for (const [id,voice] of fixture.voices) {
    const computed = computedVoiceSource.voices.get(id);
    if (!computed) throw Error('Missing generated endpoint ' + id);
    fixture.voices.set(id,{...voice,spatial:computed.spatial,monoContribution:computed.mono});
  }
}

if (pack.source?.kind !== 'independent-archive-generation' || pack.source.nativeCapturesUsedForPrediction !== false ||
    pack.source.presetSha256 !== fixture.fixture.selection.sha256 || pack.source.resourceSha256 !== fixture.fixture.resourceSha256)
  throw Error('Independently generated IR pack bound to same preset/resources required');
if (driveProfile.schema !== 1 || driveProfile.kind !== 'captured-static-drive-profile' || driveProfile.source?.nativeDynamicSnapshotsExported !== false ||
    driveProfile.source.presetSha256 !== fixture.fixture.selection.sha256 || driveProfile.source.resourceSha256 !== fixture.fixture.resourceSha256)
  throw Error('Static drive profile bound to same preset/resources required');
const sourceRoot = path.resolve(sourceDirectory), sourceBytes = fs.readFileSync(path.join(sourceRoot, 'runtime.json'));
const coefficientSource = JSON.parse(sourceBytes), sourceLaunch = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'launch.json')));
if (!coefficientSource.runStatus?.terminal || coefficientSource.runStatus.exitStatus !== 0 || coefficientSource.errors.length || coefficientSource.targetMutation !== false || coefficientSource.records.length !== 2320 || coefficientSource.hardwareBreakpoints !== 2 || coefficientSource.activeHardwareBreakpoints !== 1 || coefficientSource.raw.pending || coefficientSource.raw.records.length !== 2320 || coefficientSource.raw.warmups.length !== 1 || coefficientSource.coefficients.records.length !== 2320 || coefficientSource.coefficients.warmup?.kind !== 'completed' || coefficientSource.coefficients.sitesAdded.length)
  throw Error('Complete successful coefficient-profile source required');
for (const [file, digest] of Object.entries(sourceLaunch.helperSha256)) if (sha(fs.readFileSync(path.join(sourceRoot, '..', file))) !== digest) throw Error('Frozen coefficient source collector changed');
for (const field of ['midiSha256', 'resourceSha256']) if (sourceLaunch.fixture[field] !== fixture.fixture[field]) throw Error('Identical profile fixture required');
if (sourceLaunch.fixture.selection.sha256 !== fixture.fixture.selection.sha256) throw Error('Identical profile preset required');
const sourceFixture = sourceLaunch.fixture;
const expectedSourceArguments = [sourceFixture.binaryPath, '--headless', '--no-prefs', '--multicore', '0', '--fxp', sourceFixture.selection.path, '--midi', sourceFixture.midiPath, '--wav', path.join(sourceRoot, 'observed.wav'), '--rate', '48000', '--bit-depth', '24', '--dither', 'OFF'];
if (JSON.stringify(sourceLaunch.arguments) !== JSON.stringify(expectedSourceArguments)) throw Error('Same explicit source render configuration required');
for (const [file, digest] of [[sourceFixture.midiPath, sourceFixture.midiSha256], [sourceFixture.resourcePath, sourceFixture.resourceSha256], [sourceFixture.selection.path, sourceFixture.selection.sha256]])
  if (sha(fs.readFileSync(file)) !== digest) throw Error('Coefficient source fixture changed');
for (const sidecar of [coefficientSource.raw, coefficientSource.coefficients])
  if (sidecar.targetMutation !== false || !sidecar.runStatus?.terminal || sidecar.runStatus.exitStatus !== 0 || sidecar.runStatus.pid !== coefficientSource.runStatus.pid || sidecar.errors.length) throw Error('Bound successful same-process source payload required');
const coefficientInitial = coefficientSource.coefficients.initial;
const initialProducer = coefficientInitial.producer;
fixture.profile.globalCoefficientProducer = { keys: coefficientInitial.keys, curve: coefficientInitial.curve, producer: {
  modeCount: initialProducer.modeCount, weightedModeCount: initialProducer.weightedModeCount, timeScale: initialProducer.timeScale,
  globalControl: initialProducer.globalControl, rawGlobalControl: initialProducer.rawGlobalControl,
  static: {constants: initialProducer.static.constants, identities: initialProducer.static.identities, pairs: initialProducer.static.pairs},
  dynamic: initialProducer.dynamic,
  bitsets: initialProducer.bitsets.map((set, i) => ({...set, pointer:'queue' + i}))
} };
const scalar = coefficientInitial.globalScalar;
if (!scalar) throw Error('Bound static scalar configuration required');
fixture.profile.globalScalarProfile = {threshold:scalar.threshold, forceExtra:scalar.forceExtra,bodyEnabled:scalar.bodyEnabled,excitationEnabled:scalar.excitationEnabled};
fixture.profile.modal.forEach((config, i) => {
  const source = coefficientSource.configs[coefficientInitial.kernelObjects[i]];
  if (config.vectorCount !== source.vectorCount || config.modeCount !== source.modeCount) throw Error('Same complete modal geometry required');
  if (sha(Buffer.from(Float32Array.from(source.coefficients).buffer)) !== source.coefficientSha256) throw Error('Bound initial source coefficients required');
  config.coefficients = source.coefficients;
  delete config.coefficientVersions;
});
if(compactTarget)changedOrderBlocks=targetFixture.changedOrderBlocks;
const rawData = JSON.parse(fs.readFileSync(path.join(fixture.root, fixture.data.driveLevelFile)));
const cold = structuredClone(rawData.initial.rawKeys); for (const key of cold.keys) for (const node of key.nodes) { node.position = 0; node.intermediate = 0; }
const rawVelocityDriver=midiRawVelocitySource?.create(rawData.initial.rawKeys,fixture.velocityKeyIndex);
const raw = new GlobalRawKeys(cold), warmKeys = raw.process(rawData.warmups[0].rawBefore, { timeStep: 0,...(rawVelocityDriver?{nodeVelocities:rawVelocityDriver.velocitiesFor(rawData.warmups[0].rawBefore,0)}:{}) });
let targetRaw=null,targetRawData=null,targetVelocityDriver=null;
if(targetFixture!==fixture&&!compactTarget){
 targetRawData=JSON.parse(fs.readFileSync(path.join(targetFixture.root,targetFixture.data.driveLevelFile)));
 const cold=structuredClone(targetRawData.initial.rawKeys);for(const key of cold.keys)for(const node of key.nodes){node.position=0;node.intermediate=0;}
 targetRaw=new GlobalRawKeys(cold);targetVelocityDriver=midiRawVelocitySource?.create(targetRawData.initial.rawKeys,targetFixture.velocityKeyIndex);
 if(numericalHash(warmKeys)!==numericalHash(targetRaw.process(targetRawData.warmups[0].rawBefore,{timeStep:0,...(targetVelocityDriver?{nodeVelocities:targetVelocityDriver.velocitiesFor(targetRawData.warmups[0].rawBefore,0)}:{})})))throw Error('Order-only premise rejected: warm raw keys differ');
}
fixture.controls.forEach((control, block) => {
  const keys = raw.process(rawData.records[block].rawBefore,rawVelocityDriver?{nodeVelocities:rawVelocityDriver.velocitiesFor(rawData.records[block].rawBefore,block*64)}:{}); delete control.modalVersions;
  control.globalCoefficientInput = { rawKeys: keys.values, flags: keys.flags, pedal: flags.includes('--alter-pedal-input') && block === 160 ? 1 : rawData.records[block].rawBefore.pedalControl, extraPedal: rawData.records[block].rawBefore.extraPedalControl };
  if(targetRaw){
   const keys=targetRaw.process(targetRawData.records[block].rawBefore,targetVelocityDriver?{nodeVelocities:targetVelocityDriver.velocitiesFor(targetRawData.records[block].rawBefore,block*64)}:{}),other={rawKeys:keys.values,flags:keys.flags,pedal:targetRawData.records[block].rawBefore.pedalControl,extraPedal:targetRawData.records[block].rawBefore.extraPedalControl};
   if(numericalHash(control.globalCoefficientInput)!==numericalHash(other))throw Error('Order-only premise rejected: computed coefficient inputs differ at '+block);
  }
});
const coefficientTargets = JSON.parse(fs.readFileSync(path.join(compactTarget?fixture.root:targetFixture.root, compactTarget?fixture.data.monoBodyFile:targetFixture.data.monoBodyFile)));
if (fixture.profile.modal.some(config => 'coefficientVersions' in config) || fixture.controls.some(control => 'modalVersions' in control)) throw Error('Native dynamic coefficient versions must be absent from prediction inputs');
const engine = new ObservedVoiceStereo64(fixture.profile, pack, driveProfile);
engine.updateCoefficients({ rawKeys: warmKeys.values, flags: warmKeys.flags, keyMappingOnly: true });
const stages = {}, failures = [], blocks = [], controlStream = crypto.createHash('sha256');
const word = new DataView(new ArrayBuffer(4));
const bits = x => { if (!Number.isFinite(x)) throw Error('Finite DSP output required'); word.setFloat32(0, x, true); return word.getUint32(0, true); };
function compare(name, predicted, target, block) {
  if (predicted.length !== target.length || predicted.some((row, i) => row.length !== target[i].length)) throw Error('Complete signal shape required: ' + name);
  const stats = stages[name] ??= { checks: 0, mismatches: 0 };
  for (let row = 0; row < predicted.length; row++) for (let sample = 0; sample < predicted[row].length; sample++) {
    stats.checks++;
    if (bits(predicted[row][sample]) !== bits(target[row][sample])) {
      stats.mismatches++;
      if (failures.length < 30) failures.push({ name, block, row, sample, predicted: predicted[row][sample], target: target[row][sample] });
    }
  }
}
function checkState(name, predicted, target, block, index) {
  const stats = stages[name] ??= { checks: 0, mismatches: 0 }; stats.checks++;
  if (!Object.is(predicted, target)) {
    stats.mismatches++;
    if (failures.length < 30) failures.push({ name, block, index, predicted, target });
  }
}
const floatHash = values => sha(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
for (let block = 0; block < fixture.order.length; block++) {
  const own = engine.process64(targetFixture.order[block].map(id => fixture.voices.get(id)), fixture.controls[block]);
  const target = targetFixture.target(block);
  const controlBytes = Buffer.alloc(4);controlBytes.writeFloatLE(engine.lastRawGlobalControl);controlStream.update(controlBytes);
  coefficientTargets.observations[block].dispatch.kernels.forEach((kernel, i) => {
    let digest = kernel.coefficientSha256;
    if (flags.includes('--poison-coefficient-target') && block === 0 && i === 0) digest = (digest[0] === '0' ? '1' : '0') + digest.slice(1);
    checkState('global-coefficient-table', sha(Buffer.from(engine.modal[i].coefficients.buffer)), digest, block, i);
  });
  for (const [name, rows] of Object.entries(target)) compare(name, ArrayBuffer.isView(own[name]) ? [own[name]] : own[name], rows, block);
  const states = targetFixture.states(block);
  if(states){
  engine.keys.forEach((model, i) => {
    checkState('key-state', floatHash(model.states), states.keys[i].stateSha256, block, i);
    checkState('key-previous', bits(model.previousInput), bits(states.keys[i].previousInput), block, i);
    checkState('key-sleep', model.sleeping, states.keys[i].sleeping, block, i);
  });
  engine.modal.forEach((model, i) => {
    checkState('modal-state', floatHash(model.states), states.modal[i].statesSha256, block, i);
    checkState('modal-counter', model.counter, states.modal[i].counter, block, i);
    checkState('modal-previous', bits(model.previousInput), bits(states.modal[i].previousInput), block, i);
  });
  engine.filters.forEach((model, i) => {
    checkState('lattice-state', floatHash(model.ring), states.lattice[i].ringSha256, block, i);
    checkState('lattice-write', model.write, states.lattice[i].write, block, i);
    checkState('lattice-read', model.read, states.lattice[i].read, block, i);
  });
  }
  blocks.push(own.stereo);
  if (block % 256 === 0) process.stderr.write(`block ${block}\n`);
}
const pcmParts = [];
for (const [index, writer] of fixture.writers.entries()) {
  const rows = [new Float32Array(256), new Float32Array(256)], first = writer.afterGlobalBlocks - 4;
  for (let b = 0; b < 4; b++) for (let row = 0; row < 2; row++) rows[row].set(blocks[first + b][row], b * 64);
  const writerTarget=targetFixture.writerTarget(index);if(writerTarget)compare('writer', rows, writerTarget, first);
  pcmParts.push(Buffer.from(encodeObservedPcm24(rows)));
}
const pcm = Buffer.concat(pcmParts), target = Buffer.from(targetFixture.pcm);
const outputWav = reportPath + '.wav', header = Buffer.alloc(44);
header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
header.writeUInt16LE(1,20); header.writeUInt16LE(2,22); header.writeUInt32LE(48000,24); header.writeUInt32LE(288000,28);
header.writeUInt16LE(6,32); header.writeUInt16LE(24,34); header.write('data',36); header.writeUInt32LE(pcm.length,40);
fs.writeFileSync(outputWav,Buffer.concat([header,pcm]),{flag:'wx'});
if (flags.includes('--poison-pcm-target')) target[0] ^= 1;
if (pcm.length !== target.length) throw Error('Complete native PCM extent required');
let pcmSampleDifferences = 0;
for (let i = 0; i < pcm.length; i += 3) if (pcm.readUIntLE(i, 3) !== target.readUIntLE(i, 3)) pcmSampleDifferences++;
const report = { schema: 1,nativeDynamicRawNodeVelocitiesUsedForPrediction:!midiRawVelocitySource,midiRawVelocitySource:midiRawVelocitySource?.metadata??null,midiRawVelocityLevels:fixture.midiRawVelocitySummary,midiRawVelocityCoefficients:rawVelocityDriver?.summary()??null, orderOnlyCounterfactual:targetFixture!==fixture, changedOrderBlocks, orderOnlyPremiseVerified:targetFixture!==fixture&&!compactTarget, compactOrderSufficiencyExperiment:compactTarget, targetGlobalControlsAndStatesObserved:!compactTarget, referenceControlsReusedForCompactTarget:compactTarget, targetWriterSpansObserved:!compactTarget, coefficientTargetsFromReference:compactTarget, coefficientTargetRuntimeSha256:compactTarget?fixture.runtimeSha256:targetFixture.runtimeSha256, computedCoefficientInputStreamsEqual:targetRaw?true:null,
  computedVoiceEndpointReportSha256: computedVoiceSource?.reportSha256 ?? null,
  computedVoiceEndpointAudioSha256: computedVoiceSource?.audioSha256 ?? null,
  computedVoiceEndpointSourceRuntimeSha256: computedVoiceSource?.captureRuntimeSha256 ?? null,
  nativeSpatialAndCouplingEndpointAudioUsedForPrediction: !computedVoiceSource,
  nativeTerminalVoiceAudioStillObserved: computedVoiceSource?.nativeTerminalAudioStillObserved ?? null, nativeAuxiliaryEntryStillObserved: computedVoiceSource?.nativeAuxiliaryEntryStillObserved ?? null, computedTerminalManifestSha256: computedVoiceSource?.terminalManifestSha256 ?? null, voiceEndpointSourceSameRun: computedVoiceSource ? computedVoiceSource.captureRuntimeSha256 === fixture.runtimeSha256 : null,
  nativeVoiceAudioBoundary: computedVoiceSource ? (computedVoiceSource.nativeTerminalAudioStillObserved ? 'terminal groups and auxiliary before spatial processing' : (computedVoiceSource.nativeAuxiliaryEntryStillObserved ? 'auxiliary entry before terminal processing; remaining observed source controls and scheduling' : 'native-generated source waveform tables/profiles and runtime controls/scheduling; no per-block native intermediate audio')) : 'spatial, auxiliary and mono endpoints', coefficientSourceRuntimeSha256: sha(sourceBytes), coefficientSourceSameRun: false, poisonedCoefficientTarget: flags.includes('--poison-coefficient-target'),
  coefficientSourceRoot: sourceRoot, nativeDynamicGlobalCoefficientTablesUsedForPrediction: false,
  nativeInitialGlobalCoefficientProfileStillObserved: true, rawGlobalControlFromSeparateObservedRun: false, rawPedalInputsStillObserved: true, nativeInitialScalarCounterStateUsedForPrediction: false,
  alteredPedalInput: flags.includes('--alter-pedal-input'), computedRawGlobalControlSha256: controlStream.digest('hex'),
  coefficientRefreshes: engine.coefficientProducer.refreshCount, rateLimitedUpdates: engine.coefficientProducer.limitedCount, outputWav, captureRuntimeSha256: fixture.runtimeSha256, irPackSha256: sha(packBytes), driveProfileSha256: sha(driveBytes),
  targetRuntimeSha256: targetFixture.runtimeSha256,
  profileSha256: numericalHash(fixture.profile), controlsSha256: numericalHash(fixture.controls), computedLevelChecks: fixture.computedLevelChecks,
  internalBlocks: blocks.length, writerSpans: fixture.writers.length, exportedFrames: pcm.length / 6, stages, failures,
  mismatches: Object.values(stages).reduce((n, s) => n + s.mismatches, 0) + pcmSampleDifferences,
  computedPcmSha256: sha(pcm), targetPcmSha256: sha(target), pcmSampleDifferences, poisonedPcmTarget: flags.includes('--poison-pcm-target'),
  downstreamHistoriesOwned: true, nativeGlobalIntermediateAudioUsedForPrediction: false,
  nativeInitialKeySleepFlagsUsedForPrediction: false, nativeInitialKeyHistoryGeometryUsedForPrediction: false,
  keyColdInitialization: 'zero interleaved pairs padded to four floats; dormant; previous input zero',
  nativeVoiceAudioUsedForPrediction: true, nativeControlAndCoefficientProductionUsedForPrediction: true,
  captureFreeMidiToStereoVerified: false, nativeRepeatabilityExplained: false };
report.orderOnlyExchangeMatchedTarget=targetFixture!==fixture&&report.mismatches===0;
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ reportPath, mismatches: report.mismatches, pcmSampleDifferences, computedPcmSha256: report.computedPcmSha256 }));
if (report.mismatches) process.exitCode = 1;
