import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {AuxiliaryTableSource64} from '../dsp/auxiliary-table-source.mjs';
import {readPcm} from './pianoteq_order_fixture.mjs';
const [directory, output, ...flags] = process.argv.slice(2);
if (!output || flags.length > 1 || flags.some(x => x !== '--poison-audio-target') || fs.existsSync(output) ||
    path.resolve(output).startsWith(path.resolve('.') + path.sep)) throw Error('Usage: complete-private-source fresh-private-report [--poison-audio-target]');
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
const tables = new Map();
for (const [key, table] of Object.entries(d.tables)) {
  const raw = fs.readFileSync(path.join(directory, table.file));
  if (raw.length !== table.count * 4 || sha(raw) !== table.sha256) throw Error('Complete bound source table required');
  tables.set(key, Float32Array.from({length: table.count}, (_, i) => raw.readFloatLE(i * 4)));
}
const audio = fs.readFileSync(path.join(directory, 'auxiliary.bin'));
if (audio.length !== 3314 * 768 || audio.length !== d.audioBytes || sha(audio) !== d.audioSha256) throw Error('Complete auxiliary target audio required');
const models = new Map(Object.entries(d.profiles).map(([epoch, rows]) => [Number(epoch), rows.map(p => new AuxiliaryTableSource64(p, tables))]));
const f32 = new DataView(new ArrayBuffer(4)), bits = x => {f32.setFloat32(0, x, true); return f32.getUint32(0, true)};
const stages = {}, failures = [], computed = Buffer.alloc(audio.length);let poisoned = false;
function check(stage, p, a, context) {
  const s = stages[stage] ??= {checks: 0, mismatches: 0};s.checks++;
  if (p !== a) {s.mismatches++;if (failures.length < 20) failures.push({stage, predicted: p, actual: a, ...context})}
}
for (let ordinal = 0; ordinal < 3314; ordinal++) {
  const input = d.inputs[ordinal], target = d.outputs[ordinal], own = models.get(input.epoch), context = {ordinal, epoch: input.epoch, counter: input.counter};
  if (!own || own.length !== 3 || input.profile.length !== 3 || target.epoch !== input.epoch || target.counter !== input.counter || target.offset !== ordinal * 768 || target.bytes !== 768 ||
      sha(audio.subarray(target.offset, target.offset + 768)) !== target.sourceSha256) throw Error('Bound complete auxiliary interval required');
  const a = d.transitions[ordinal * 2], b = d.transitions[ordinal * 2 + 1];
  if (a.ordinal !== ordinal || b.ordinal !== ordinal + 1 || a.from !== '0x100301c8c' || a.to !== '0x100301d60' || b.from !== a.to || b.to !== a.from) throw Error('Exact exclusive source phases required');
  own.forEach((model, row) => {
    const config = d.profiles[input.epoch][row], observed = input.profile[row];
    if (model.age !== input.counter || ['delay', 'gain', 'primary', 'secondary'].some(k => JSON.stringify(config[k]) !== JSON.stringify(observed[k])) || observed.filters.length !== model.filters.length) throw Error('Fixed source configuration and continuous age required');
    check('started', Number(model.started), observed.flags[0], {...context, row});
    check('first-third', Number(model.pastFirstThird), observed.flags[1], {...context, row});
    model.filters.forEach((state, section) => {
      if (JSON.stringify(config.filters[section].slice(4)) !== JSON.stringify(observed.filters[section].slice(4))) throw Error('Fixed auxiliary filter coefficients required');
      state.history.forEach((v, i) => check('filter-history', bits(v), observed.filters[section][i], {...context, row, section, i}));
    });
    model.process64().forEach((value, i) => {
      const at = target.offset + (row * 64 + i) * 4;computed.writeFloatLE(value, at);
      let actual = audio.readUInt32LE(at);
      if (flags.length && !poisoned && value !== 0) {actual = (actual ^ 1) >>> 0;poisoned = true}
      check('audio', bits(value), actual, {...context, row, sample: i});
    });
  });
}
if (flags.length && !poisoned) throw Error('Negative target was not exercised');
const report = {schema: 1, runtimeSha256: sha(runtimeBytes), nativeStatus: d.runStatus, blocks: 3314, samples: audio.length / 4,
  nativePcmFrames: nativePcm.length / 6, nativePcmSha256: sha(nativePcm),
  stages, failures, mismatches: Object.values(stages).reduce((n, s) => n + s.mismatches, 0), computedAudioSha256: sha(computed),
  targetAudioSha256: sha(audio), historiesOwned: true, nativeAuxiliaryAudioUsedForPrediction: false,
  nativeSourceTablesStillObserved: true, initialSourceGainsDelayAndFilterCoefficientsStillObserved: true,
  independentMidiToStereoVerified: false, poisonedTarget: poisoned};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});console.log(JSON.stringify(report));
if (report.mismatches) process.exitCode = 1;
