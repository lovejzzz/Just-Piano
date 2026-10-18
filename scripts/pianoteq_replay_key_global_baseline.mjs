// Diagnostic only: native route-entry audio/maps feed own continuously updated caches.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRoutedDelayCache, routeConstantBlock, readRoutedBlock} from '../dsp/routed-delay-cache.mjs';
import {midiBlockClock} from '../dsp/midi-block-clock.mjs';
import {injectWorkspaceFeedback} from '../dsp/workspace-feedback.mjs';
import {readComputedFeedback} from './pianoteq_feedback_artifact.mjs';

const [directory, reportPath, ...flags] = process.argv.slice(2);
const orderOptions = flags.filter(f => f.startsWith('--order-from='));
const outputOptions = flags.filter(f => f.startsWith('--global-output='));
const feedbackReportOptions = flags.filter(f => f.startsWith('--feedback-report=')), feedbackAudioOptions = flags.filter(f => f.startsWith('--feedback-audio='));
const experimentFlags = flags.filter(f => !['--global-output=', '--feedback-report=', '--feedback-audio='].some(p => f.startsWith(p)));
if (!directory || !reportPath || orderOptions.length > 1 || outputOptions.length > 1 || feedbackReportOptions.length > 1 || feedbackAudioOptions.length > 1 || feedbackReportOptions.length !== feedbackAudioOptions.length || orderOptions.length && flags.includes('--reverse-contributors') || flags.some(f => !['--reverse-contributors', '--poison-global-target', '--poison-head-target', '--poison-clock-target'].includes(f) && !['--order-from=', '--global-output=', '--feedback-report=', '--feedback-audio='].some(p => f.startsWith(p))) || new Set(flags).size !== flags.length)
  throw new Error('Usage: private-run-directory fresh-private-report [--reverse-contributors] [--poison-global-target] [--poison-head-target] [--poison-clock-target]');
const root = path.resolve(directory), output = path.resolve(reportPath);
if (fs.existsSync(output) || output.startsWith(path.resolve('.') + path.sep)) throw new Error('Fresh private report required');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function verifyHelpers(sourceRoot, manifest) {
  const isStereo = manifest.sites.includes('0x1000ef37c');
  const expected = (isStereo ? ['pianoteq_capture_convolution_scheduler.py', 'pianoteq_capture_feedback_stereo.py', 'pianoteq_capture_global_filters.py',
    'pianoteq_capture_key_audio_baseline.py', 'pianoteq_capture_key_mix.py', 'pianoteq_capture_key_routes.py', 'pianoteq_capture_key_stereo_baseline.py',
    'pianoteq_capture_modal_source.py', 'pianoteq_capture_recurrence.py', 'pianoteq_capture_room_mix.py', 'pianoteq_capture_soundboard_responses.py',
    'pianoteq_capture_soundboard_state.py', 'pianoteq_capture_source_amplitude.py', 'pianoteq_capture_worker_bank512.py', 'pianoteq_damper_runtime_capture.py'] :
    ['pianoteq_capture_key_audio_baseline.py', 'pianoteq_capture_soundboard_responses.py', 'pianoteq_damper_runtime_capture.py']);
  if (manifest.feedbackLatticeSameRun) expected.push('pianoteq_capture_feedback_allpass_continuous.py', 'pianoteq_capture_feedback_allpass_probe.py');
  if (manifest.monoBodySameRun) expected.push('pianoteq_capture_mono_body_continuous.py', 'pianoteq_capture_global_recurrence.py');
  if (manifest.driveLevelSameRun) expected.push('pianoteq_capture_drive_level_phases.py', 'pianoteq_capture_drive_level_producer.py');
  if (manifest.keyResonanceSameRun) expected.push('pianoteq_capture_key_resonance.py');
  expected.sort();
  if (JSON.stringify(Object.keys(manifest.helperSha256).sort()) !== JSON.stringify(expected) ||
      manifest.collectorSha256 !== manifest.helperSha256[isStereo ? 'pianoteq_capture_key_stereo_baseline.py' : 'pianoteq_capture_key_audio_baseline.py']) throw new Error('Complete bound collector closure required');
  for (const [name, digest] of Object.entries(manifest.helperSha256))
    if (sha(fs.readFileSync(path.join(sourceRoot, '..', name))) !== digest) throw new Error('Frozen helper changed');
}
function nativePcmAt(sourceRoot) {
  const wav = fs.readFileSync(path.join(sourceRoot, 'observed.wav'));
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE' || wav.readUInt32LE(4) + 8 !== wav.length)
    throw new Error('Complete native WAV extent required');
  let fmt, pcm, position = 12;
  while (position + 8 <= wav.length) {
    const size = wav.readUInt32LE(position + 4), name = wav.toString('ascii', position, position + 4);
    if (position + 8 + size > wav.length) throw new Error('Truncated native WAV chunk');
    if (name === 'fmt ') {if (fmt) throw new Error('Duplicate WAV format'); fmt = wav.subarray(position + 8, position + 8 + size);}
    if (name === 'data') {if (pcm) throw new Error('Duplicate WAV PCM'); pcm = wav.subarray(position + 8, position + 8 + size);}
    position += 8 + size + (size & 1);
  }
  if (position !== wav.length || !fmt || fmt.length < 16 || fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(2) !== 2 ||
      fmt.readUInt32LE(4) !== 48000 || fmt.readUInt16LE(12) !== 6 || fmt.readUInt16LE(14) !== 24 || !pcm?.length || pcm.length % 6)
    throw new Error('Complete stereo24/48k native PCM required');
  return {frames: pcm.length / 6, sha256: sha(pcm)};
}
const launch = JSON.parse(fs.readFileSync(path.join(root, 'launch.json')));
const data = JSON.parse(fs.readFileSync(path.join(root, 'runtime.json')));
const extended = launch.sites.includes('0x1000ef37c'), withWriter = launch.sites.includes('0x10091baa4');
const postFeedback = data.globalAudioBoundary === 'post-feedback';
const expectedSites = postFeedback ? ['0x10051fad4'] : ['0x10051fad4', '0x1006c2ac4'];
if (extended) {
  expectedSites.push(data.monoBodySameRun ? '0x100829d48' : data.feedbackLatticeSameRun ? '0x1006ca950' : '0x1002a4334', '0x1006c2fd4', '0x1000ef37c');
  if (!data.writerOnlyStereoTarget) expectedSites.push('0x1001bc114');
}
if (withWriter) expectedSites.push('0x10091baa4');
if (data.driveLevelSameRun) expectedSites.push('0x100096558');
if (JSON.stringify(launch.sites) !== JSON.stringify(expectedSites) || !data.keyGlobalSameRun ||
    !data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.errors.length || data.keyAudioErrors.length ||
    data.targetMutation !== false || data.hardwareBreakpoints !== expectedSites.length || data.pendingGlobalContributors.length ||
    extended && (!data.keyStereoSameRun || data.downstreamErrors.length || data.downstreamPending !== null))
  throw new Error('Complete error-free terminal read-only paired capture required');
verifyHelpers(root, launch);
const fixture = launch.fixture;
for (const [file, digest] of [[fixture.midiPath, fixture.midiSha256], [fixture.resourcePath, fixture.resourceSha256], [fixture.selection.path, fixture.selection.sha256]])
  if (sha(fs.readFileSync(file)) !== digest) throw new Error('Bound native input changed');
const expectedArguments = [fixture.binaryPath, '--headless', '--no-prefs', '--multicore', '0', '--fxp', fixture.selection.path,
  '--midi', fixture.midiPath, '--wav', path.join(root, 'observed.wav'), '--rate', '48000', '--bit-depth', '24', '--dither', 'OFF'];
if (JSON.stringify(launch.arguments) !== JSON.stringify(expectedArguments)) throw new Error('Explicit normal render arguments required');
const nativePcm = nativePcmAt(root);
const word = new DataView(new ArrayBuffer(4));
const fromBits = x => {word.setUint32(0, x, true); return word.getFloat32(0, true);};
const bits = x => {word.setFloat32(0, x, true); return word.getUint32(0, true);};
const failures = [];
let checks = 0, mismatches = 0, nonAudioMismatches = 0, context, poisoned = false, poisonedHead = false, poisonedClock = false;
const check = (name, predicted, actual) => {checks++; if (!Object.is(predicted, actual)) {mismatches++; if (name !== 'global-audio-bits') nonAudioMismatches++; if (failures.length < 20) failures.push({name, predicted, actual, context});}};
function stream(name, sourceData = data, sourceRoot = root) {
  const records = sourceData[name + 'AudioRecords'], bytes = fs.readFileSync(path.join(sourceRoot, sourceData[name + 'AudioFile']));
  if (!records.length || bytes.length !== records.length * 3072 || bytes.length !== sourceData[name + 'AudioBytes'] || sha(bytes) !== sourceData[name + 'AudioSha256'])
    throw new Error('Complete exact raw audio stream required');
  const ages = new Map();
  records.forEach((r, i) => {
    if (r.ordinal !== i || r.offset !== i * 3072 || r.bytes !== 3072 || sha(bytes.subarray(r.offset, r.offset + 3072)) !== r.sha256 ||
        r.layouts.length !== 4 || r.layouts.some(([height, capacity, width, pitch]) => height !== 3 || capacity < 3 || capacity > 8 || width !== 64 || pitch < 64 || pitch > 8192))
      throw new Error('Complete block chronology, digest and row coverage required');
    if (name === 'key') {
      if (!Number.isInteger(r.epoch) || r.epoch < 0 || r.epoch >= 5 || r.voiceBlockCounter !== (ages.get(r.epoch) ?? -64) + 64 || r.nativeAge !== r.voiceBlockCounter + 64)
        throw new Error('Five contiguous routed voices required');
      ages.set(r.epoch, r.voiceBlockCounter);
    } else if (r.globalFrame !== i * 64) throw new Error('Contiguous complete global blocks required');
  });
  if (name === 'key' && ages.size !== 5) throw new Error('All five voice streams required');
  return {records, rows(r) {return Array.from({length: 12}, (_, row) => Float32Array.from({length: 64}, (_, i) => {
    const v = bytes.readFloatLE(r.offset + (row * 64 + i) * 4); if (!Number.isFinite(v)) throw new Error('Finite native samples required'); return v;
  }));}};
}
const key = stream('key'), global = stream('global');
const ownFeedback = feedbackReportOptions.length ? readComputedFeedback(root, data, feedbackReportOptions[0].slice('--feedback-report='.length), feedbackAudioOptions[0].slice('--feedback-audio='.length)) : null;
const feedbackByGlobal = new Map();
if (postFeedback) {
  if (!extended || !withWriter || data.globalSnapshotSite !== '0x1006c2fd4') throw new Error('Explicit post-feedback snapshot identity required');
  const raw = fs.readFileSync(path.join(root, data.downstreamFile));
  if (raw.length !== data.downstreamBytes || sha(raw) !== data.downstreamSha256) throw new Error('Complete downstream audio extent required');
  let offset = 0;
  for (const [i, r] of data.downstreamRecords.entries()) {
    const size = {feedbackRoute: 1280, cabinet: 3840, pcm: 512, writer: r.samples * 8}[r.stage];
    if (r.ordinal !== i || r.offset !== offset || r.bytes !== size || sha(raw.subarray(offset, offset + size)) !== r.sha256)
      throw new Error('Complete contiguous downstream byte coverage required');
    if (r.stage === 'feedbackRoute') {
      if (feedbackByGlobal.has(r.globalOrdinal)) throw new Error('Unique feedback source per block required');
      const target = Array.from({length: 3}, (_, row) => Float32Array.from({length: 64}, (_, j) => {
        const value = raw.readFloatLE(offset + ((row + 2) * 64 + j) * 4);
        if (!Number.isFinite(value)) throw new Error('Finite feedback source required'); return value;
      }));
      if (ownFeedback) {
        const own = ownFeedback.rows(r.globalOrdinal);
        own.forEach((row, k) => row.forEach((x, j) => check('computed-feedback-target', bits(x), bits(target[k][j]))));
        feedbackByGlobal.set(r.globalOrdinal, own);
      } else feedbackByGlobal.set(r.globalOrdinal, target);
    }
    offset += size;
  }
  if (offset !== raw.length || feedbackByGlobal.size !== global.records.length) throw new Error('Complete same-run feedback coverage required');
}
const clock = midiBlockClock(fs.readFileSync(fixture.midiPath), {sampleRate: 48000});
if (clock.noteOns.length !== 5) throw new Error('Five primary MIDI strikes required');
const ownAges = new Map(), keyFrames = key.records.map(r => {
  const age = ownAges.get(r.epoch) ?? 0;
  context = {epoch: r.epoch, counter: age, stage: 'midi-clock'};
  check('voice-age', age, r.voiceBlockCounter);
  const frame = clock.noteOns[r.epoch].frame + age;
  let targetBlock = r.globalOrdinal;
  if (flags.includes('--poison-clock-target') && !poisonedClock) {targetBlock++; poisonedClock = true;}
  check('MIDI-global-block', frame / 64, targetBlock);
  ownAges.set(r.epoch, age + 64);
  return frame;
});
if (keyFrames.some((frame, i) => frame % 64 || i && frame < keyFrames[i - 1])) throw new Error('MIDI placement contradicts chronological routing');
const first = global.records[0];
if (first.cacheHeads.length !== 4) throw new Error('Four initial cache geometries required');
const roots = first.cacheHeads.map(c => c.root);
if (new Set(roots).size !== 4) throw new Error('Distinct cache roots required');
let alternateOrder = null, alternateGlobalHash = null, alternateRoot = null, alternateNativePcm = null;
if (orderOptions.length) {
  alternateRoot = path.resolve(orderOptions[0].slice('--order-from='.length));
  if (alternateRoot === root) throw new Error('Distinct complete alternate run required');
  const otherLaunch = JSON.parse(fs.readFileSync(path.join(alternateRoot, 'launch.json')));
  const other = JSON.parse(fs.readFileSync(path.join(alternateRoot, 'runtime.json')));
  if (JSON.stringify(otherLaunch.fixture) !== JSON.stringify(fixture) || JSON.stringify(otherLaunch.sites) !== JSON.stringify(launch.sites) ||
      !other.keyGlobalSameRun || !other.runStatus?.terminal || other.runStatus.exitStatus !== 0 || other.errors.length || other.keyAudioErrors.length ||
      other.targetMutation !== false || other.hardwareBreakpoints !== expectedSites.length || other.pendingGlobalContributors.length ||
      extended && (!other.keyStereoSameRun || other.downstreamErrors.length || other.downstreamPending !== null))
    throw new Error('Bound complete alternate native run required');
  verifyHelpers(alternateRoot, otherLaunch);
  const expectedOtherArguments = expectedArguments.map(a => a === path.join(root, 'observed.wav') ? path.join(alternateRoot, 'observed.wav') : a);
  if (JSON.stringify(otherLaunch.arguments) !== JSON.stringify(expectedOtherArguments)) throw new Error('Identical alternate normal rendering arguments required');
  const otherKey = stream('key', other, alternateRoot), otherGlobal = stream('global', other, alternateRoot);
  const geometry = record => record.cacheHeads.map(c => ({sampleRate: c.sampleRate, maximumDelay: c.maximumDelay,
    rows: c.rows.map(r => ({smallChunk: r.smallChunk, bigChunk: r.bigChunk, total: r.total}))}));
  if (otherKey.records.length !== key.records.length || otherGlobal.records.length !== global.records.length ||
      JSON.stringify(geometry(otherGlobal.records[0])) !== JSON.stringify(geometry(first))) throw new Error('Equal complete alternate geometry and extents required');
  const byKey = new Map(key.records.map(r => [r.epoch + ':' + r.voiceBlockCounter, r]));
  alternateOrder = new Map();
  for (const r of otherKey.records) {
    const identity = r.epoch + ':' + r.voiceBlockCounter, original = byKey.get(identity);
    if (!original || original.sha256 !== r.sha256 || JSON.stringify(original.mappings) !== JSON.stringify(r.mappings) ||
        JSON.stringify(original.groupGains) !== JSON.stringify(r.groupGains) || JSON.stringify(original.selectionMask) !== JSON.stringify(r.selectionMask))
      throw new Error('Alternate order may not change audio, mappings, gains or selection');
    const frame = clock.noteOns[r.epoch].frame + r.voiceBlockCounter;
    if (r.globalOrdinal !== frame / 64) throw new Error('Same MIDI placement required for alternate order');
    if (!alternateOrder.has(frame)) alternateOrder.set(frame, new Map());
    const ranks = alternateOrder.get(frame);
    if (ranks.has(identity)) throw new Error('Duplicate alternate contribution');
    ranks.set(identity, ranks.size);
  }
  alternateGlobalHash = other.globalAudioSha256;
  alternateNativePcm = nativePcmAt(alternateRoot);
}
const caches = first.cacheHeads.map(c => createRoutedDelayCache({sampleRate: c.sampleRate, maximumDelay: c.maximumDelay,
  rings: c.rows.map(r => ({smallChunk: r.smallChunk, bigChunk: r.bigChunk, total: r.total, head: 0,
    flags: Array.from({length: r.total / r.bigChunk}, () => 15)}))}));
const metadata = (row, flagsToo) => {
  if (row.cacheHeads.length !== 4 || JSON.stringify(row.cacheHeads.map(c => c.root)) !== JSON.stringify(roots)) throw new Error('Same-run stable cache roots required');
  row.cacheHeads.forEach((c, i) => {
    if (c.rows.length !== 3) throw new Error('Three cache rows required');
    check('sampleRate', caches[i].sampleRate, c.sampleRate); check('maximumDelay', caches[i].maximumDelay, c.maximumDelay);
    c.rows.forEach((r, j) => {
      const own = caches[i].rings[j];
      for (const k of ['smallChunk', 'bigChunk', 'total', 'head']) {
        let target = r[k];
        if (k === 'head' && flags.includes('--poison-head-target') && !poisonedHead) {target ^= 64; poisonedHead = true;}
        check('cache:' + k, own[k], target);
      }
      if (flagsToo) {
        if (r.flags.length !== own.flags.length) throw new Error('Complete validity inventory required');
        r.flags.forEach((v, k) => check('validity', own.flags[k], v));
      }
    });
  });
};
const entries = mapping => mapping.entries.map(e => {
  if (e.tapWords.length !== 6 || ![0, 1].includes(mapping.wrap)) throw new Error('Exactly one complete routing tap and valid wrap required');
  const w = e.tapWords.map(fromBits);
  if (!w.every(Number.isFinite)) throw new Error('Finite routing coefficients required');
  return {source: e.source, destination: e.destination, taps: [{delay: w[0], startGain: w[1], endGain: w[2], multiplier: w[4]}]};
});
let nextKey = 0;
const resultHash = crypto.createHash('sha256');
const audioOutput = outputOptions.length ? path.resolve(outputOptions[0].slice('--global-output='.length)) : null;
if (audioOutput && (audioOutput === output || fs.existsSync(audioOutput) || audioOutput.startsWith(path.resolve('.') + path.sep))) throw new Error('Fresh distinct private audio output required');
const audioDescriptor = audioOutput ? fs.openSync(audioOutput, 'wx', 0o600) : null;
for (const g of global.records) {
  context = {globalBlock: g.ordinal, stage: 'key'};
  const contributors = [];
  while (nextKey < key.records.length && keyFrames[nextKey] === g.ordinal * 64) contributors.push(key.records[nextKey++]);
  if (JSON.stringify(contributors.map(r => ({epoch: r.epoch, counter: r.voiceBlockCounter, keyOrdinal: r.ordinal}))) !== JSON.stringify(g.contributors))
    throw new Error('Complete original ordered contribution batch required');
  if (flags.includes('--reverse-contributors')) contributors.reverse();
  if (alternateOrder && contributors.length) {
    const ranks = alternateOrder.get(g.ordinal * 64);
    if (!ranks || ranks.size !== contributors.length || contributors.some(r => !ranks.has(r.epoch + ':' + r.voiceBlockCounter)))
      throw new Error('Complete same-frame alternate contribution inventory required');
    contributors.sort((a, b) => ranks.get(a.epoch + ':' + a.voiceBlockCounter) - ranks.get(b.epoch + ':' + b.voiceBlockCounter));
  }
  for (const r of contributors) {
    context = {globalBlock: g.ordinal, epoch: r.epoch, counter: r.voiceBlockCounter, stage: 'key'};
    metadata(r, false);
    if (r.selectionMask.length !== 3 || r.selectionMask.some(v => v !== 1) || r.mappings.length !== 4 || r.groupGains.length !== 3 || r.groupGains.some(v => v !== 1))
      throw new Error('Inspected complete NY routing profile required');
    const source = key.rows(r);
    for (let i = 0; i < 4; i++) {
      const input = source.slice(i === 0 ? 9 : (i - 1) * 3, i === 0 ? 12 : i * 3);
      routeConstantBlock(caches[i], input, entries(r.mappings[i]), i === 0 ? 1 : r.groupGains[i - 1], !!r.mappings[i].wrap);
    }
  }
  const outputs = caches.map(readRoutedBlock), predicted = [...outputs.slice(1).flat(), ...outputs[0]], actual = global.rows(g);
  let compared = predicted;
  if (postFeedback) {
    if (g.feedbackPreRoute !== 0) throw new Error('Pre-route feedback branch not covered');
    compared = [...injectWorkspaceFeedback(outputs.slice(1), feedbackByGlobal.get(g.ordinal), g.feedbackGain).flat, ...outputs[0]];
  }
  context = {globalBlock: g.ordinal, stage: 'global'};
  metadata(g, true);
  const encoded = Buffer.alloc(3072);
  for (let row = 0; row < 12; row++) for (let i = 0; i < 64; i++) {
    let target = actual[row][i];
    if (flags.includes('--poison-global-target') && !poisoned && target !== 0) {target = fromBits(bits(target) ^ 1); poisoned = true;}
    check('global-audio-bits', bits(compared[row][i]), bits(target));
    encoded.writeFloatLE(predicted[row][i], (row * 64 + i) * 4);
  }
  resultHash.update(encoded);
  if (audioDescriptor !== null) fs.writeSync(audioDescriptor, encoded);
}
if (audioDescriptor !== null) fs.closeSync(audioDescriptor);
if (nextKey !== key.records.length || flags.includes('--poison-global-target') && !poisoned) throw new Error('Complete contribution/negative-control coverage required');
if (flags.includes('--poison-head-target') && !poisonedHead || flags.includes('--poison-clock-target') && !poisonedClock) throw new Error('Complete clock/head negative-control coverage required');
const computedHash = resultHash.digest('hex');
const report = {schema: 'pianoteq-key-global-replay-v1', checks, mismatches, nonAudioMismatches, failures,
  globalBlocks: global.records.length, voiceBlocks: key.records.length, order: alternateOrder ? 'alternate-native' : flags.includes('--reverse-contributors') ? 'reverse' : 'observed',
  computedGlobalAudioSha256: computedHash, computedGlobalAudioFile: audioOutput,
  computedGlobalAudioBoundary: 'pre-feedback', nativeGlobalAudioBoundary: postFeedback ? 'post-feedback' : 'pre-feedback',
  captureRuntimeSha256: sha(fs.readFileSync(path.join(root, 'runtime.json'))),
  nativeAccumulationMathVerified: !experimentFlags.length && mismatches === 0,
  alternateNativeOrderReproducedExactGlobalAudio: alternateOrder ? computedHash === alternateGlobalHash : null,
  sharedCacheOrderEffectVerified: !!alternateOrder && experimentFlags.length === 1 && !nonAudioMismatches &&
    computedHash === alternateGlobalHash && alternateGlobalHash !== data.globalAudioSha256,
  alternateOrderSource: alternateRoot,
  nativePcm, alternateNativePcm,
  nativeKeyAudioStillObserved: true, nativeRoutingMapsStillObserved: true, nativeGlobalScheduleStillObserved: true,
  nativeKeyAgesUsedForPrediction: false, nativeKeyGlobalOrdinalUsedForPrediction: false,
  nativeCacheHeadsUsedForPrediction: false, nativeContributionOrderStillObserved: true,
  nativeCacheGeometryStillObserved: true,
  nativeFeedbackAudioStillObserved: postFeedback && !ownFeedback,
  computedFeedbackReportSha256: ownFeedback?.reportSha256 ?? null, computedFeedbackAudioSha256: ownFeedback?.audioSha256 ?? null,
  nativeMonoFeedbackSourceStillObserved: ownFeedback ? !ownFeedback.usesComputedMono : false,
  nativeModalInputsAndDriveScratchStillObserved: !!ownFeedback?.usesComputedMono && !ownFeedback?.usesComputedDrive,
  nativeDriveScratchUsedForPrediction: !!ownFeedback?.usesComputedMono && !ownFeedback?.usesComputedDrive,
  nativeModalInputsAndExistingMonoStillObserved: !!ownFeedback?.usesComputedMono && (!ownFeedback?.usesComputedKeyInputs || !ownFeedback?.usesComputedBodyBefore),
  nativeDriveLevelGainStillObserved: !!ownFeedback?.usesComputedDrive && !ownFeedback?.usesComputedLevels,
  nativeDriveLevelUsedForPrediction: !!ownFeedback?.usesComputedDrive && !ownFeedback?.usesComputedLevels,
  nativeDriveGainStillObserved: !!ownFeedback?.usesComputedDrive, computedLevelsSource: !!ownFeedback?.usesComputedLevels,
  computedKeyInputsSource: !!ownFeedback?.usesComputedKeyInputs,
  nativeModalInputAudioUsedForPrediction: !ownFeedback?.usesComputedKeyInputs, nativeExistingMonoStillObserved: !!ownFeedback?.usesComputedMono && !ownFeedback?.usesComputedBodyBefore,
  computedBodyBeforeSource: !!ownFeedback?.usesComputedBodyBefore, nativePerKeyCoefficientTablesStillObserved: !!ownFeedback?.usesComputedBodyBefore,
  nativeDriveStaticProfileAndWindowStillObserved: !!ownFeedback?.usesComputedDrive,
  predictedCachesUpdatedFromNativeGlobalAudio: false, initialLogicalEmptyStateAssumedAndChecked: true,
  causalExplanationProven: false, independentStereoVerified: false, finalPcmVerified: false};
fs.writeFileSync(output, JSON.stringify(report, null, 2), {flag: 'wx', mode: 0o600});
console.log(JSON.stringify(report));
if (mismatches) process.exitCode = 1;
