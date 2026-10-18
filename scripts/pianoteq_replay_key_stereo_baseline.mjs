// Same-run diagnostic: computed shared cache outputs -> feedback/CABN -> actual writer spans.
// Upstream voice audio, routing/IR/profile sources and writer dispatch are still observed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {CabinetConvolution64} from '../dsp/cabinet-convolution.mjs';
import {DryStereoPost64} from '../dsp/dry-stereo-post.mjs';
import {GlobalRoutedMix64} from '../dsp/global-routed-mix.mjs';
import {injectWorkspaceFeedback} from '../dsp/workspace-feedback.mjs';
import {encodeObservedPcm24} from '../dsp/pcm24.mjs';
import {applyIrPack} from '../dsp/ir-pack.mjs';
import {buildCabinetBanksFromIrPack} from '../dsp/cabinet-bank-source.mjs';
import {readComputedFeedback} from './pianoteq_feedback_artifact.mjs';

const [directory, sharedReportPath, reportPath, ...flags] = process.argv.slice(2);
const option = prefix => {
  const values = flags.filter(f => f.startsWith(prefix));
  if (values.length > 1) throw new Error('Duplicate option ' + prefix);
  return values.length ? values[0].slice(prefix.length) : null;
};
const outputWav = option('--output-wav='), packPath = option('--ir-pack=');
const feedbackReportPath = option('--feedback-report='), feedbackAudioPath = option('--feedback-audio=');
if (!directory || !sharedReportPath || !reportPath || !!feedbackReportPath !== !!feedbackAudioPath || new Set(flags).size !== flags.length || flags.some(f => !['--output-wav=', '--ir-pack=', '--feedback-report=', '--feedback-audio='].some(p => f.startsWith(p)) && !['--poison-cabinet-target', '--poison-ir-target', '--poison-plan-target', '--poison-feedback-target'].includes(f)))
  throw new Error('Usage: private-run shared-report fresh-private-report [--output-wav=private.wav] [--ir-pack=private.json] [--poison-cabinet-target]');
const root = path.resolve(directory), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const file of [reportPath, outputWav].filter(Boolean))
  if (fs.existsSync(file) || path.resolve(file).startsWith(path.resolve('.') + path.sep)) throw new Error('Fresh private output required');
const runtimeBytes = fs.readFileSync(path.join(root, 'runtime.json')), data = JSON.parse(runtimeBytes);
const launch = JSON.parse(fs.readFileSync(path.join(root, 'launch.json')));
const sharedReport = JSON.parse(fs.readFileSync(sharedReportPath));
if (!data.keyStereoSameRun || !data.writerInputObserved || data.globalAudioBoundary !== 'post-feedback' ||
    !data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.downstreamErrors.length || data.keyAudioErrors.length ||
    data.errors.length || data.downstreamPending !== null || data.hardwareBreakpoints !== (data.writerOnlyStereoTarget ? 5 : 6) || data.activeHardwareBreakpoints !== (data.feedbackLatticeSameRun && !data.writerOnlyStereoTarget ? 6 : 5) ||
    sharedReport.captureRuntimeSha256 !== sha(runtimeBytes) || !sharedReport.nativeAccumulationMathVerified || sharedReport.mismatches ||
    sharedReport.computedGlobalAudioBoundary !== 'pre-feedback') throw new Error('Bound complete accepted shared computation and writer capture required');
if (data.feedbackLatticeSameRun) {
  if (data.writerTransitions.length || data.convolutionIrTimeInputsCaptured !== false || data.irCopyCount !== 0 || launch.writerInitiallyDisabled !== false || !packPath)
    throw new Error('Observed lattice mode requires own IR and writer active from launch');
} else if (data.writerTransitions.length !== 1 || data.writerTransitions[0].globalOrdinal !== 0 || data.writerTransitions[0].active !== 5)
  throw new Error('Single initial IR-to-writer handoff required');
const ownFeedback = feedbackReportPath ? readComputedFeedback(root, data, feedbackReportPath, feedbackAudioPath) : null;
if (ownFeedback && (sharedReport.computedFeedbackAudioSha256 !== ownFeedback.audioSha256 || sharedReport.computedFeedbackReportSha256 !== ownFeedback.reportSha256))
  throw new Error('Shared and final stereo must consume identical computed feedback');
if (flags.includes('--poison-feedback-target') && !ownFeedback) throw new Error('Feedback target control requires computed feedback');
const shared = fs.readFileSync(sharedReport.computedGlobalAudioFile), downstream = fs.readFileSync(path.join(root, data.downstreamFile));
if (sha(shared) !== sharedReport.computedGlobalAudioSha256 || shared.length !== data.globalAudioRecords.length * 3072 ||
    sha(downstream) !== data.downstreamSha256 || downstream.length !== data.downstreamBytes)
  throw new Error('Complete bound computed/native stream extents required');
const configs = Object.entries(data.downstreamConfigurations);
if (configs.length !== 1) throw new Error('One initial CABN profile required');
const [cabinetIdentity, cfg] = configs[0];
if (flags.includes('--poison-plan-target')) cfg.head.configuration.plans[0][0][1] ^= 1;
let irTargetPoisoned = false;
if (flags.includes('--poison-ir-target')) {
  for (const ring of cfg.head.configuration.kernels) {
    if (!ring || irTargetPoisoned) continue;
    const slot = ring.slots.find(s => !s.empty && s.data?.length);
    if (slot) {
      const word = Buffer.alloc(4); word.writeFloatLE(slot.data[0]); word.writeUInt32LE((word.readUInt32LE() ^ 1) >>> 0);
      slot.data[0] = word.readFloatLE(); irTargetPoisoned = true;
    }
  }
  if (!irTargetPoisoned) throw new Error('Complete IR target negative control required');
}
let head = structuredClone(cfg.head.configuration), tail = structuredClone(cfg.tail.configuration), packSlots = null, independentIrPack = false, irPackSource = null, ownBankSource = false;
if (packPath) {
  const pack = JSON.parse(fs.readFileSync(packPath));
  packSlots = {head: applyIrPack(head, pack, 'head'), tail: applyIrPack(tail, pack, 'tail')};
  irPackSource = pack.source ?? null;
  independentIrPack = pack.source?.kind === 'independent-archive-generation' && pack.source.nativeCapturesUsedForPrediction === false && pack.source.numericalInputFileCount === 1;
  if (independentIrPack && (pack.source.presetSha256 !== launch.fixture.selection.sha256 || pack.source.resourceSha256 !== launch.fixture.resourceSha256 ||
      !/^[a-f0-9]{64}$/.test(pack.source.sourceArchiveSha256) || !/^[a-f0-9]{64}$/.test(pack.source.generatorManifestSha256) || pack.source.nodeSha256?.length !== 9))
    throw new Error('Independent IR pack must bind the exact fixture and complete generated nodes');
  if (independentIrPack && pack.source.nodeLengths) {
    const generated = buildCabinetBanksFromIrPack(pack);
    head = generated.head; tail = generated.tail; ownBankSource = true;
  }
}
if (flags.includes('--poison-plan-target') && !ownBankSource) throw new Error('Plan-target control requires independent bank source');
if (data.feedbackLatticeSameRun && !ownBankSource) throw new Error('Lattice mode requires independently generated cold convolution banks');
const cabinet = new CabinetConvolution64(head, tail), post = new DryStereoPost64(cfg.post);
const view = new DataView(new ArrayBuffer(4));
const bits = value => {if (!Number.isFinite(value)) throw new Error('Finite DSP sample required'); view.setFloat32(0, value, true); return view.getUint32(0, true);};
const fromBits = value => {view.setUint32(0, value, true); return view.getFloat32(0, true);};
let checks = 0, mismatches = 0, context = null, poisoned = false, feedbackPoisoned = false;
const failures = [], pcmParts = [], stereoBlocks = [];
const check = (name, predicted, actual) => {
  checks++;
  if (!Object.is(predicted, actual)) {mismatches++; if (failures.length < 30) failures.push({name, predicted, actual, context});}
};
function compareRows(name, predicted, actual) {
  if (predicted.length !== actual.length || predicted.some((r, i) => r.length !== actual[i].length)) throw new Error('Complete row inventory required');
  for (let row = 0; row < predicted.length; row++) for (let i = 0; i < predicted[row].length; i++) {
    let target = bits(actual[row][i]);
    if (name === 'cabinet-source' && flags.includes('--poison-cabinet-target') && !poisoned && actual[row][i] !== 0) {target = (target ^ 1) >>> 0; poisoned = true;}
    if (name === 'feedback-source' && flags.includes('--poison-feedback-target') && !feedbackPoisoned && actual[row][i] !== 0) {target = (target ^ 1) >>> 0; feedbackPoisoned = true;}
    check(name, bits(predicted[row][i]), target);
  }
}
for (const [name, bank, captured] of [['head', cabinet.head, cfg.head.configuration], ['tail', cabinet.tail.model, cfg.tail.configuration]]) {
  if (ownBankSource) {
    const own = name === 'head' ? head : tail;
    for (const k of ['blockSize', 'inputCount', 'stepCount']) check(name + ':' + k, own[k], captured[k]);
    if (own.routes.length !== captured.routes.length || captured.plans.length !== 1 || own.plans[0].length !== captured.plans[0].length)
      throw new Error('Complete convolution topology/plan target coverage required');
    own.routes.forEach((r, i) => r.forEach((v, j) => check(name + ':route', v, captured.routes[i][j])));
    own.plans[0].forEach((r, i) => r.forEach((v, j) => check(name + ':plan', v, captured.plans[0][i][j])));
    for (const kind of ['inputs', 'kernels']) {
      if (own[kind].length !== captured[kind].length) throw new Error('Complete bank rings required');
      own[kind].forEach((ring, i) => {
        const target = captured[kind][i];
        if (ring.slots.length !== target.slots.length) throw new Error('Complete ring slot coverage required');
        check(name + ':' + kind + ':cursor', ring.cursor, target.cursor);
        ring.slots.forEach((slot, j) => {
          for (const k of ['empty', 'content', 'timestamp']) check(name + ':' + kind + ':' + k, slot[k], target.slots[j][k]);
        });
      });
    }
    own.outputs.forEach((out, i) => {
      for (const k of ['empty', 'content', 'timestamp']) check(name + ':output:' + k, out.fft[k], captured.outputs[i].fft[k]);
      compareRows(name + ':initial-history', [out.history], [captured.outputs[i].history]);
    });
  }
  for (let row = 0; row < captured.kernels.length; row++) {
    if (!captured.kernels[row]) continue;
    for (let i = 0; i < captured.kernels[row].slots.length; i++) {
      const target = captured.kernels[row].slots[i];
      if (!target.empty) compareRows(name + '-IR-spectrum', [bank.kernels[row].slots[i].data], [target.data]);
    }
  }
}
const decode = (raw, offset, rows, samples = 64) => Array.from({length: rows}, (_, row) => Float32Array.from({length: samples}, (_, i) => {
  const value = raw.readFloatLE(offset + (row * samples + i) * 4); bits(value); return value;
}));
const routingEntries = mapping => mapping.entries.map(e => {
  if (e.tapWords.length !== 6) throw new Error('Single complete feedback routing tap required');
  const w = e.tapWords.map(fromBits);
  return {source: e.source, destination: e.destination, taps: [{delay: w[0], startGain: w[1], endGain: w[2], multiplier: w[4]}]};
});
let byteOffset = 0, nextGlobal = 0, stage = 'feedbackRoute', current = null, globalMix = null, globalMapping = null, writerCount = 0;
for (const [ordinal, record] of data.downstreamRecords.entries()) {
  const expectedRows = {feedbackRoute: [2, 3], cabinet: [9, 3, 3], pcm: [2]}[record.stage];
  const expectedBytes = record.stage === 'writer' ? record.samples * 8 : expectedRows?.reduce((a, b) => a + b, 0) * 256;
  if (record.ordinal !== ordinal || record.offset !== byteOffset || record.bytes !== expectedBytes ||
      sha(downstream.subarray(byteOffset, byteOffset + expectedBytes)) !== record.sha256)
    throw new Error('Complete exact downstream chronology/byte coverage required');
  if (record.stage === 'writer') {
    if (stage !== 'feedbackRoute' || current || record.samples !== 256 || record.channels !== 2 || record.sourceOffsetFrames !== 0 ||
        record.afterGlobalBlocks !== nextGlobal || nextGlobal !== (writerCount + 1) * 4)
      throw new Error('Actual contiguous four-block writer span required; no alignment search');
    const firstBlock = nextGlobal - 4;
    const own = [new Float32Array(256), new Float32Array(256)];
    for (let block = 0; block < 4; block++) for (let row = 0; row < 2; row++) own[row].set(stereoBlocks[firstBlock + block][row], block * 64);
    context = {writer: writerCount, firstBlock, samples: 256};
    const actual = decode(downstream, byteOffset, 2, 256);
    compareRows('writer-input', own, actual);
    pcmParts.push(Buffer.from(encodeObservedPcm24(own)));
    writerCount++;
  } else {
    if (record.stage !== stage || record.globalOrdinal !== nextGlobal || nextGlobal >= data.globalAudioRecords.length ||
        record.layouts.length !== expectedRows.length || record.layouts.some(([height, capacity, width, pitch], i) =>
          height !== expectedRows[i] || capacity < height || capacity > 16 || width !== 64 || pitch < 64 || pitch > 8192))
      throw new Error('Complete ordered same-run feedback/cabinet/PCM stages required');
    context = {globalBlock: nextGlobal, stage};
    if (stage === 'feedbackRoute') {
      const g = data.globalAudioRecords[nextGlobal], source = decode(shared, nextGlobal * 3072, 12);
      if (g.ordinal !== nextGlobal || g.feedbackPreRoute !== 0 || record.gain !== 1 || record.rowFlags.length !== 3)
        throw new Error('Inspected post-route feedback branch required');
      if (!globalMix) {
        const seed = structuredClone(record.cache);
        for (const ring of seed.rings) {ring.head = 0; ring.flags = ring.flags.map(() => 15);}
        globalMix = new GlobalRoutedMix64(seed, routingEntries(record.mapping), !!record.mapping.wrap);
        globalMapping = JSON.stringify(record.mapping);
      }
      if (JSON.stringify(record.mapping) !== globalMapping) throw new Error('Changing feedback route not covered');
      const actualCache = record.cache;
      if (actualCache.rings.length !== globalMix.cache.rings.length) throw new Error('Complete feedback cache rows required');
      for (let i = 0; i < actualCache.rings.length; i++) {
        const a = actualCache.rings[i], own = globalMix.cache.rings[i];
        for (const key of ['head', 'total', 'smallChunk', 'bigChunk']) check('feedback-cache:' + key, own[key], a[key]);
        if (a.flags.length !== own.flags.length) throw new Error('Complete feedback validity flags required');
        a.flags.forEach((value, j) => check('feedback-validity', own.flags[j], value));
      }
      const audio = decode(downstream, byteOffset, 5), sum = ownFeedback ? ownFeedback.rows(nextGlobal) : audio.slice(2);
      if (ownFeedback) compareRows('feedback-source', sum, audio.slice(2));
      const mix = globalMix.process64(audio.slice(0, 2), sum, record.gateEnabled, record.rowFlags);
      current = {before: mix.output, injected: injectWorkspaceFeedback([source.slice(0, 3), source.slice(3, 6), source.slice(6, 9)], sum, g.feedbackGain),
        auxiliary: source.slice(9), phase: 'feedback'};
      stage = 'cabinet';
    } else if (stage === 'cabinet') {
      if (!current || record.state !== cabinetIdentity || record.mode !== 1 || JSON.stringify(record.gain) !== '[1,1,0,0]')
        throw new Error('Bound additive CABN profile required');
      const actual = decode(downstream, byteOffset, 15);
      compareRows('cabinet-source', current.injected.flat, actual.slice(0, 9));
      compareRows('cabinet-before', current.before, actual.slice(9, 12));
      compareRows('cabinet-auxiliary', current.auxiliary, actual.slice(12));
      const result = cabinet.process64(current.injected.flat, current.before, record.mode);
      current.output = post.process64(result.output, current.auxiliary).output;
      current.phase = 'cabinet'; stage = 'pcm';
      if (data.writerOnlyStereoTarget) {
        stereoBlocks.push(current.output); current = null; nextGlobal++; stage = 'feedbackRoute';
      }
    } else {
      if (!current || current.phase !== 'cabinet' || record.state !== cabinetIdentity) throw new Error('Bound PCM output required');
      for (let i = 0; i < 4; i++) check('output-level', cfg.post.level[i], record.level[i]);
      compareRows('stereo-float', current.output, decode(downstream, byteOffset, 2));
      stereoBlocks.push(current.output); current = null; nextGlobal++; stage = 'feedbackRoute';
    }
  }
  byteOffset += expectedBytes;
}
if (byteOffset !== downstream.length || current || stage !== 'feedbackRoute' || nextGlobal !== data.globalAudioRecords.length || !writerCount ||
    flags.includes('--poison-cabinet-target') && !poisoned || flags.includes('--poison-feedback-target') && !feedbackPoisoned) throw new Error('Complete downstream/writer coverage required');
const pcm = Buffer.concat(pcmParts), nativeWav = fs.readFileSync(path.join(root, 'observed.wav'));
let nativePcm = null, fmt = null, position = 12;
if (nativeWav.toString('ascii', 0, 4) !== 'RIFF' || nativeWav.toString('ascii', 8, 12) !== 'WAVE' || nativeWav.readUInt32LE(4) + 8 !== nativeWav.length)
  throw new Error('Complete native WAV required');
while (position + 8 <= nativeWav.length) {
  const n = nativeWav.readUInt32LE(position + 4), name = nativeWav.toString('ascii', position, position + 4);
  if (position + 8 + n > nativeWav.length) throw new Error('Truncated native WAV');
  if (name === 'data') {if (nativePcm) throw new Error('Duplicate PCM'); nativePcm = nativeWav.subarray(position + 8, position + 8 + n);}
  if (name === 'fmt ') {if (fmt) throw new Error('Duplicate format'); fmt = nativeWav.subarray(position + 8, position + 8 + n);}
  position += 8 + n + (n & 1);
}
if (position !== nativeWav.length || !fmt || fmt.length < 16 || fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(2) !== 2 || fmt.readUInt32LE(4) !== 48000 ||
    fmt.readUInt16LE(14) !== 24 || !nativePcm || nativePcm.length !== pcm.length) throw new Error('Exact complete native PCM extent required; no cropping');
let pcmDifferences = 0;
for (let i = 0; i < pcm.length; i += 3) if (pcm.readIntLE(i, 3) !== nativePcm.readIntLE(i, 3)) pcmDifferences++;
const passed = mismatches === 0 && pcmDifferences === 0;
if (outputWav) {
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(48000, 24); header.writeUInt32LE(288000, 28);
  header.writeUInt16LE(6, 32); header.writeUInt16LE(24, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(outputWav, Buffer.concat([header, pcm]), {flag: 'wx', mode: 0o600});
}
const report = {schema: 'pianoteq-key-stereo-baseline-v1', passed, checks, mismatches, failures, pcmDifferences,
  internalBlocks: nextGlobal, internalFrames: nextGlobal * 64, writerSpans: writerCount, exportedFrames: pcm.length / 6,
  internalFramesNotSubmittedToWriter: nextGlobal * 64 - pcm.length / 6, computedPcmSha256: sha(pcm), nativePcmSha256: sha(nativePcm),
  captureRuntimeSha256: sha(runtimeBytes), packSlots, outputWav, sameRunStereoMathVerified: passed,
  perBlockStereoFloatTargetObserved: !data.writerOnlyStereoTarget,
  nativeVoiceAudioStillObserved: true, nativeRoutingMapsStillObserved: true, nativeFeedbackSourcesStillObserved: true,
  nativeThreeRowFeedbackUsedForPrediction: !ownFeedback, nativeTwoRowGlobalExcitationStillObserved: true,
  nativeMonoFeedbackSourceStillObserved: ownFeedback ? !ownFeedback.usesComputedMono : false,
  nativeModalInputsAndDriveScratchStillObserved: !!ownFeedback?.usesComputedMono && !ownFeedback?.usesComputedDrive,
  nativeDriveScratchUsedForPrediction: !!ownFeedback?.usesComputedMono && !ownFeedback?.usesComputedDrive,
  nativeModalInputsAndExistingMonoStillObserved: !!ownFeedback?.usesComputedMono,
  nativeDriveLevelGainStillObserved: !!ownFeedback?.usesComputedDrive,
  nativeDriveStaticProfileAndWindowStillObserved: !!ownFeedback?.usesComputedDrive, computedFeedbackReportSha256: ownFeedback?.reportSha256 ?? null,
  computedFeedbackAudioSha256: ownFeedback?.audioSha256 ?? null,
  nativeIrTimeInputsStillObserved: !independentIrPack, nativeIrCopyUsedForPrediction: !packPath,
  nativeIrSourceReplacedByPack: !!packPath, independentIrPack, irPackSource,
  nativeConvolutionPlansStillObserved: !ownBankSource, nativeConvolutionRoutesStillObserved: !ownBankSource,
  nativeConvolutionRingGeometryUsedForPrediction: !ownBankSource, nativeConvolutionObjectPointersUsedForPrediction: !ownBankSource,
  convolutionBanksConstructedFromIndependentIr: ownBankSource,
  nativePostProfileStillObserved: true, nativeWriterDispatchStillObserved: true,
  nativeIntermediateAudioUsedToUpdateConvolutionOrPostState: false, independentEngineStereoVerified: false,
  alignmentApplied: false, normalizationApplied: false, nativePcmExtentCropped: false};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), {flag: 'wx', mode: 0o600});
console.log(JSON.stringify(report));
if (!passed) process.exitCode = 1;
