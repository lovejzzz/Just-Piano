import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { midiBlockClock } from '../dsp/midi-block-clock.mjs';
import { GlobalRawKeys } from '../dsp/global-raw-keys.mjs';
import { GlobalDriveLevel } from '../dsp/global-drive-level.mjs';

export const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const numberWord = new DataView(new ArrayBuffer(8));
export function canonical(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('Finite common numerical input required');
    numberWord.setFloat64(0, value, true); return numberWord.getBigUint64(0, true).toString(16).padStart(16, '0');
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value, canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const numericalHash = value => sha(JSON.stringify(canonical(value)));
export function coldCache(value) {
  const rows = value.rings ?? value.rows;
  return { sampleRate: value.sampleRate, maximumDelay: value.maximumDelay,
    rings: rows.map(r => ({ smallChunk: r.smallChunk, bigChunk: r.bigChunk, total: r.total, head: 0,
      flags: Array.from({ length: r.total / r.bigChunk }, () => 15) })) };
}
const ringShape = r => ({ capacity: r.capacity, width: r.width });
function roomProfile(profile) {
  return { damping: profile.damping.map(ringShape), channels: profile.channels.map(c => ({
    input: ringShape(c.input), sum: ringShape(c.sum), output: ringShape(c.output), updateCountdown: c.updateCountdown,
    outputDelay: c.outputDelay, postFilterEnabled: c.postFilterEnabled,
    combs: c.combs.map(x => ({ damping: x.damping, mix: x.mix, delay: x.delay, ring: ringShape(x.ring) })),
    allpasses: c.allpasses.map(x => ({ gain: x.gain, delay: x.delay, ring: ringShape(x.ring) })),
    postFir: c.postFir ? { blocks: c.postFir.blocks, coefficients: c.postFir.coefficients } : null,
  })) };
}
function postProfile(post) {
  const copy = structuredClone(post);
  copy.stereoCache = coldCache(post.stereoCache);
  copy.filters.forEach(filter => { delete filter.root; });
  return copy;
}
function levels(data) {
  if (data.warmups?.length !== 1 || data.warmups[0].callerSites[0] !== '0x1006b95e8' || data.records.length !== 2320)
    throw Error('Complete zero-time raw initializer and render sequence required');
  const initial = data.initial, cold = structuredClone(initial.rawKeys);
  for (const key of cold.keys) for (const node of key.nodes) {
    if ((key.flags[0] & 1) && !(key.flags[1] & 1) && !Object.is(node.position, 0)) throw Error('Zero live cold raw state required');
    node.position = 0; node.intermediate = 0;
  }
  const raw = new GlobalRawKeys(cold), sensor = new GlobalDriveLevel({ weights: initial.weights, sampleRate: 48000,
    enabledGain: initial.enabledGain, initialReset: initial.reset });
  let checks = 0;
  const equal = (a, b) => { checks++; if (!Object.is(a, b)) throw Error('Independent raw-key/sensor calculation differs'); };
  const output = [];
  for (const [i, item] of [data.warmups[0], ...data.records].entries()) {
    const warmup = i === 0;
    if (item.frameEndTarget !== (warmup ? 0 : i * 64) || item.rawBefore.samples !== 64 || item.rawBefore.sampleRate !== 48000)
      throw Error('Complete fixed raw clock required');
    item.pairsBefore.forEach(([timer, previous], k) => { equal(sensor.timers[k], timer); equal(sensor.previous[k], previous); });
    const keys = raw.process(item.rawBefore, warmup ? { timeStep: 0 } : {});
    keys.values.forEach((value, k) => equal(value, item.input[k]));
    const value = sensor.process(keys.values, Math.max(item.rawBefore.pedalControl, item.rawBefore.extraPedalControl));
    item.pairsAfter.forEach(([timer, previous], k) => { equal(sensor.timers[k], timer); equal(sensor.previous[k], previous); });
    equal(value, item.levelTarget);
    if (!warmup) output.push(value);
  }
  return { values: output, checks, configuration: { weights: initial.weights, enabledGain: initial.enabledGain, initialReset: initial.reset } };
}
export function readPcm(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.readUInt32LE(4) + 8 !== bytes.length)
    throw Error('Complete RIFF required');
  let pcm, fmt, position = 12;
  while (position + 8 <= bytes.length) {
    const n = bytes.readUInt32LE(position + 4), label = bytes.toString('ascii', position, position + 4);
    if (position + 8 + n > bytes.length) throw Error('Truncated WAV');
    if (label === 'data') { if (pcm) throw Error('Duplicate PCM'); pcm = bytes.subarray(position + 8, position + 8 + n); }
    if (label === 'fmt ') { if (fmt) throw Error('Duplicate format'); fmt = bytes.subarray(position + 8, position + 8 + n); }
    position += 8 + n + (n & 1);
  }
  if (position !== bytes.length || !fmt || fmt.length < 16 || fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(2) !== 2 ||
      fmt.readUInt32LE(4) !== 48000 || fmt.readUInt16LE(14) !== 24 || pcm?.length !== 148224 * 6)
    throw Error('Complete primary stereo24/48k PCM required');
  return pcm;
}
export function loadOrderFixture(directory) {
  const root = path.resolve(directory), runtimeBytes = fs.readFileSync(path.join(root, 'runtime.json')), data = JSON.parse(runtimeBytes);
  const launch = JSON.parse(fs.readFileSync(path.join(root, 'launch.json')));
  if (!data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.targetMutation !== false || data.errors.length || data.keyAudioErrors.length ||
      data.downstreamErrors.length || data.downstreamPending !== null || data.pendingGlobalContributors.length || data.globalAudioRecords.length !== 2320 ||
      data.keyAudioRecords.length !== 3314 || !data.keyResonanceSameRun || !data.globalExcitationSameRun || !data.globalExcitationPassive ||
      data.hardwareBreakpoints !== 6 || data.activeHardwareBreakpoints !== 5 || data.irCopyCount !== 0 || data.convolutionIrTimeInputsCaptured !== false)
    throw Error('Complete primary same-run observed-voice fixture required');
  for (const [file, digest] of Object.entries(launch.helperSha256)) if (sha(fs.readFileSync(path.join(root, '..', file))) !== digest) throw Error('Frozen collector changed');
  const fixture = launch.fixture;
  for (const [file, digest] of [[fixture.midiPath, fixture.midiSha256], [fixture.resourcePath, fixture.resourceSha256], [fixture.selection.path, fixture.selection.sha256]])
    if (sha(fs.readFileSync(file)) !== digest) throw Error('Bound fixture changed');
  const expectedArguments = [fixture.binaryPath, '--headless', '--no-prefs', '--multicore', '0', '--fxp', fixture.selection.path,
    '--midi', fixture.midiPath, '--wav', path.join(root, 'observed.wav'), '--rate', '48000', '--bit-depth', '24', '--dither', 'OFF'];
  if (JSON.stringify(launch.arguments) !== JSON.stringify(expectedArguments)) throw Error('Normal render configuration required');
  const sidecar = name => {
    const bytes = fs.readFileSync(path.join(root, data[name + 'File']));
    if (sha(bytes) !== data[name + 'Sha256']) throw Error('Bound sidecar changed');
    const value = JSON.parse(bytes);
    if (!value.runStatus?.terminal || value.runStatus.exitStatus !== 0 || value.runStatus.pid !== data.runStatus.pid || value.errors.length || value.pending || value.targetMutation !== false)
      throw Error('Complete same-process sidecar required');
    return value;
  };
  const mono = sidecar('monoBody'), keys = sidecar('keyResonance'), room = sidecar('globalExcitation'), lattice = sidecar('feedbackLattice'), raw = sidecar('driveLevel');
  const computedLevels = levels(raw);
  const stream = name => {
    const bytes = fs.readFileSync(path.join(root, data[name + 'File']));
    if (bytes.length !== data[name + 'Bytes'] || sha(bytes) !== data[name + 'Sha256']) throw Error('Complete bound audio stream required');
    return bytes;
  };
  const keyAudio = stream('keyAudio'), globalAudio = stream('globalAudio'), downstream = stream('downstream');
  const decode = (bytes, offset, rows, samples = 64) => Array.from({ length: rows }, (_, row) => Float32Array.from({ length: samples }, (_, i) => {
    const value = bytes.readFloatLE(offset + (row * samples + i) * 4);
    if (!Number.isFinite(value)) throw Error('Finite target/source audio required'); return value;
  }));
  const clock = midiBlockClock(fs.readFileSync(fixture.midiPath), { sampleRate: 48000 });
  if (clock.noteOns.length !== 5) throw Error('Primary five-strike MIDI required');
  const ages = new Map(), voices = new Map(), order = Array.from({ length: 2320 }, () => []);
  for (const [i, item] of data.keyAudioRecords.entries()) {
    const age = ages.get(item.epoch) ?? 0;
    if (!clock.noteOns[item.epoch]) throw Error('Bound MIDI voice required');
    const frame = clock.noteOns[item.epoch].frame + age, id = `${item.epoch}:${age}`;
    if (item.ordinal !== i || item.offset !== i * 3072 || item.bytes !== 3072 || sha(keyAudio.subarray(item.offset, item.offset + item.bytes)) !== item.sha256 ||
        item.voiceBlockCounter !== age || item.nativeAge !== age + 64 || item.globalOrdinal !== frame / 64 || voices.has(id))
      throw Error('Unique complete keyed voice endpoint and MIDI placement required');
    voices.set(id, { keyIndex: item.keyIndex, mixLevels: item.mixLevels, monoContribution: item.monoContribution, mappings: item.mappings,
      groupGains: item.groupGains, selectionMask: item.selectionMask, spatial: decode(keyAudio, item.offset, 12) });
    order[frame / 64].push(id); ages.set(item.epoch, age + 64);
  }
  if (keyAudio.length !== 3314 * 3072 || globalAudio.length !== 2320 * 3072) throw Error('Full voice/shared audio extents required');
  const feedbackRecords = [], cabinetRecords = [], writerRecords = [];
  let offset = 0;
  for (const [i, item] of data.downstreamRecords.entries()) {
    const expected = { feedbackRoute: 1280, cabinet: 3840, writer: 2048 }[item.stage];
    if (!expected || item.ordinal !== i || item.offset !== offset || item.bytes !== expected || sha(downstream.subarray(offset, offset + expected)) !== item.sha256)
      throw Error('Complete downstream coverage required');
    if (item.stage === 'feedbackRoute') feedbackRecords.push(item);
    if (item.stage === 'cabinet') cabinetRecords.push(item);
    if (item.stage === 'writer') writerRecords.push(item);
    offset += expected;
  }
  if (offset !== downstream.length || feedbackRecords.length !== 2320 || cabinetRecords.length !== 2320 || writerRecords.length !== 579) throw Error('Complete native target inventory required');
  const modal = mono.observations[0].dispatch.kernels.map(k => {
    const c = mono.configs[k.object];
    if (!c || c.initial.states.some(x => !Object.is(x, 0)) || c.initial.counter !== 0 || !Object.is(c.initial.previousInput, 0)) throw Error('Zero global cold histories required');
    return { vectorCount: c.vectorCount, modeCount: c.modeCount, coefficients: c.coefficients, coefficientVersions: c.coefficientVersions,
      initial: { states: Array(c.vectorCount * 8).fill(0), counter: 0, previousInput: 0, disabled: 0 } };
  });
  const configList = Object.values(data.downstreamConfigurations);
  if (configList.length !== 1) throw Error('One fixed cabinet/post profile required');
  const profile = { keys: keys.initial.map(k => ({ modeCount: k.modeCount, stateFloats: k.stateFloats,
      sleeping: k.sleeping, previousInput: k.previousInput, stateAllPositiveZero: k.stateAllPositiveZero })),
    keyCoefficients: keys.coefficientVersions, modal, sharedCaches: data.globalAudioRecords[0].cacheHeads.map(coldCache),
    lattice: lattice.observations[0].before.map(x => ({ length: x.length, write: x.write, read: x.read, taps: x.taps })),
    feedbackRoute: { cache: coldCache(lattice.observations[0].routeBefore.cache), mapping: {
      entries: lattice.observations[0].routeBefore.entries, wrap: lattice.observations[0].routeBefore.wrap } },
    room: roomProfile(room.profile), globalMix: { cache: coldCache(feedbackRecords[0].cache), mapping: feedbackRecords[0].mapping },
    post: postProfile(configList[0].post), rawConfiguration: computedLevels.configuration };
  const controls = mono.observations.map((m, block) => {
    const r = room.records[block], f = feedbackRecords[block], g = data.globalAudioRecords[block], l = lattice.observations[block];
    if (m.ordinal !== block || keys.observations[block].ordinal !== block || r.ordinal !== block || f.globalOrdinal !== block || cabinetRecords[block].globalOrdinal !== block ||
        m.queueBefore.enabled !== 0 || m.queueReturn.enabled !== 0 || r.autoGainEnabled !== 0 || r.wrapperAfter.crossfade !== 0 ||
        r.pedalsBefore.some(x => x.parameterValues[0] !== 0) || l.postFilterEnabled !== 0 || g.feedbackPreRoute !== 0 ||
        numericalHash(f.mapping) !== numericalHash(profile.globalMix.mapping)) throw Error('Fixed inspected processing branches required');
    return { level: computedLevels.values[block], driveGain: m.driveGain, directGain: m.directGain, directScratchGain: m.directScratchGain, scratchGain: m.scratchGain,
      modalVersions: m.dispatch.kernels.map(k => k.coefficientSha256), keys: keys.observations[block].keys.map(k => ({ version: k.coefficientSha256, gain: k.gain })),
      roomGains: r.gains, feedbackGain: g.feedbackGain, gateEnabled: f.gateEnabled, rowFlags: f.rowFlags,
      pedalValues: r.pedalsBefore.map(x => x.parameterValues), routeGain: f.gain, cabinetGain: cabinetRecords[block].gain,
      cabinetMode: cabinetRecords[block].mode };
  });
  const writers = writerRecords.map((w, i) => {
    if (w.afterGlobalBlocks !== (i + 1) * 4 || w.samples !== 256 || w.channels !== 2 || w.sourceOffsetFrames !== 0) throw Error('Exact common writer spans required');
    return { afterGlobalBlocks: w.afterGlobalBlocks, samples: w.samples, channels: w.channels, sourceOffsetFrames: w.sourceOffsetFrames };
  });
  return { root, data, fixture, runtimeSha256: sha(runtimeBytes), profile, controls, order, voices, writers, computedLevelChecks: computedLevels.checks,
    pcm: readPcm(path.join(root, 'observed.wav')), target(block) {
      const m = mono.observations[block];
      return { keyInputs: [m.driveInputBefore[0], m.bodyInputs[1][0], m.bodyInputs[2][0]], bodyBefore: [m.bodyBefore[0]], drive: [m.driveScratch[0]],
        first: [m.bodyInputs[0][0]], mono: [m.monoTarget[0]], direct: [m.directSource[0]], room: room.records[block].audioAfter,
        feedback: lattice.observations[block].feedbackOutput, sharedPost: decode(globalAudio, block * 3072, 12),
        cabinetInput: decode(downstream, cabinetRecords[block].offset, 9), cabinetBefore: decode(downstream, cabinetRecords[block].offset + 2304, 3),
        auxiliary: decode(downstream, cabinetRecords[block].offset + 3072, 3) };
    }, states(block) { return { keys: keys.observations[block].keys, modal: mono.observations[block].after, lattice: lattice.observations[block].after }; },
    writerTarget(index) { return decode(downstream, writerRecords[index].offset, 2, 256); } };
}
