import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { midiBlockClock } from '../dsp/midi-block-clock.mjs';
import { KeyResonance64 } from '../dsp/key-resonance.mjs';
import { accumulateKeyMono64 } from '../dsp/key-mono-accumulation.mjs';
import { readComputedKeyInputs } from './pianoteq_feedback_artifact.mjs';

const [directory, destination, ...flags] = process.argv.slice(2);
const option = prefix => {
  const found = flags.filter(x => x.startsWith(prefix));
  if (found.length > 1) throw Error('Unique key resonance option required');
  return found[0]?.slice(prefix.length);
};
const keyReport = option('--key-inputs-report='), keyAudio = option('--key-inputs-audio='), outputPath = option('--output-body-before=');
if (!directory || !destination || !keyReport || !keyAudio || flags.some(x => !['--key-inputs-report=', '--key-inputs-audio=', '--output-body-before='].some(p => x.startsWith(p)) && !['--poison-history-target', '--poison-body-before-target'].includes(x)))
  throw Error('Usage: complete-run fresh-report --key-inputs-report=REPORT --key-inputs-audio=AUDIO [--output-body-before=NEW_FILE] [--poison-history-target|--poison-body-before-target]');
for (const file of [destination, outputPath].filter(Boolean))
  if (fs.existsSync(file) || path.resolve(file).startsWith(path.resolve('.') + path.sep)) throw Error('Fresh private key resonance artifacts required');
const root = path.resolve(directory), sha = b => crypto.createHash('sha256').update(b).digest('hex');
const runtime = fs.readFileSync(path.join(root, 'runtime.json')), capture = JSON.parse(runtime);
const launch = JSON.parse(fs.readFileSync(path.join(root, 'launch.json')));
if (!capture.keyResonanceSameRun || !launch.keyResonanceSameRun) throw Error('Same-run cold key resonance required');
const bytes = fs.readFileSync(path.join(root, capture.keyResonanceFile)), data = JSON.parse(bytes);
const monoBytes = fs.readFileSync(path.join(root, capture.monoBodyFile)), mono = JSON.parse(monoBytes);
if (!data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.runStatus.pid !== capture.runStatus.pid ||
    data.errors.length || data.targetMutation !== false || data.observations.length !== 2320 || data.initial?.length !== 105 ||
    sha(bytes) !== capture.keyResonanceSha256 || sha(monoBytes) !== capture.monoBodySha256 ||
    mono.errors.length || mono.pending || mono.observations.length !== 2320 || mono.runStatus.pid !== data.runStatus.pid)
  throw Error('Complete bounded same-run key resonance proof required');
const ownInputs = readComputedKeyInputs(root, capture, keyReport, keyAudio);
for (const [name, digest] of Object.entries(launch.helperSha256))
  if (sha(fs.readFileSync(path.join(root, '..', name))) !== digest) throw Error('Frozen collector changed');
const tables = new Map();
for (const [digest, rows] of Object.entries(data.coefficientVersions)) {
  const packed = Buffer.alloc(rows.length * 24);
  rows.forEach((r, i) => {
    if (!Number.isInteger(r.modeIndex) || r.modeIndex < 0) throw Error('Bounded key mode index required');
    packed.writeUInt32LE(r.modeIndex, i * 24);
    ['decay', 'b', 'a', 'c', 'd'].forEach((field, j) => {
      if (!Number.isFinite(r[field])) throw Error('Finite key coefficient profile required');
      packed.writeFloatLE(r[field], i * 24 + 4 + j * 4);
    });
  });
  if (sha(packed) !== digest) throw Error('Bound key coefficient table required');
  tables.set(digest, rows);
}
const models = data.initial.map((config, i) => {
  if (config.index !== i || sha(Buffer.alloc(config.stateFloats * 4)) !== config.stateSha256) throw Error('Complete zero cold key state required');
  return new KeyResonance64(config);
});
let checks = 0, mismatches = 0, historyPoisoned = false, audioPoisoned = false;
const failures = [], parts = [];
const word = new DataView(new ArrayBuffer(4));
const bits = x => { if (!Number.isFinite(x)) throw Error('Finite recurrence value required'); word.setFloat32(0, x, true); return word.getUint32(0, true); };
function check(a, b, label) { checks++; if (!Object.is(a, b)) { mismatches++; if (failures.length < 12) failures.push({ label, computed: a, target: b }); } }
const clock = midiBlockClock(fs.readFileSync(launch.fixture.midiPath), { sampleRate: 48000 });
if (clock.noteOns.length !== 5) throw Error('Primary MIDI strike inventory required');
const ages = new Map(), batches = Array.from({ length: 2320 }, () => []);
for (const item of capture.keyAudioRecords) {
  if (!Number.isInteger(item.epoch) || !clock.noteOns[item.epoch]) throw Error('Bound MIDI voice identity required');
  const age = ages.get(item.epoch) ?? 0, block = (clock.noteOns[item.epoch].frame + age) / 64;
  if (block >= batches.length) throw Error('Bound MIDI key input frame required');
  check(age, item.voiceBlockCounter, `${item.ordinal}.age`); check(block, item.globalOrdinal, `${item.ordinal}.clock`);
  batches[block].push(item); ages.set(item.epoch, age + 64);
}
for (const [block, item] of data.observations.entries()) {
  if (item.ordinal !== block || item.keys.length !== models.length || mono.observations[block].ordinal !== block) throw Error('Complete key recurrence chronology required');
  const keys = accumulateKeyMono64(batches[block]), inputRows = ownInputs.rows(block);
  [keys.firstModal, keys.secondModal, keys.thirdModal].forEach((row, r) => row.forEach((x, i) => check(bits(x), bits(inputRows[r][i]), `${block}.keyInput.${r}.${i}`)));
  let body = new Float32Array(64);
  for (const [index, target] of item.keys.entries()) {
    const model = models[index], coefficients = tables.get(target.coefficientSha256);
    if (target.index !== index || target.modeCount !== model.modeCount || target.stateFloats !== model.states.length || !coefficients)
      throw Error('Stable complete key recurrence layout required');
    body = model.process64(keys.slots.get(index) ?? null, coefficients, target.gain, body);
    let actualHistory = target.stateSha256;
    if (flags.includes('--poison-history-target') && !historyPoisoned && !target.stateAllPositiveZero) {
      actualHistory = (actualHistory[0] === '0' ? '1' : '0') + actualHistory.slice(1); historyPoisoned = true;
    }
    check(sha(Buffer.from(model.states.buffer)), actualHistory, `${block}.${index}.history`);
    check(bits(model.previousInput), bits(target.previousInput), `${block}.${index}.previousInput`);
    check(model.sleeping, target.sleeping, `${block}.${index}.sleeping`);
  }
  const target = mono.observations[block].bodyBefore;
  if (target.length !== 1 || target[0].length !== 64) throw Error('Complete pre-body mono target required');
  body.forEach((x, i) => {
    let actual = bits(target[0][i]);
    if (flags.includes('--poison-body-before-target') && !audioPoisoned && x !== 0) { actual = (actual ^ 1) >>> 0; audioPoisoned = true; }
    check(bits(x), actual, `${block}.bodyBefore.${i}`);
  });
  parts.push(Buffer.from(body.buffer));
}
const audio = Buffer.concat(parts), passed = mismatches === 0;
const report = { schema: 1, passed, captureRuntimeSha256: sha(runtime), inputSha256: sha(bytes), monoBodySha256: sha(monoBytes),
  blocks: data.observations.length, keys: models.length, checks, mismatches, failures, historyPoisoned, audioPoisoned,
  computedBodyBeforeSha256: sha(audio), computedKeyInputsReportSha256: ownInputs.reportSha256, computedKeyInputsAudioSha256: ownInputs.audioSha256,
  wakes: models.reduce((n, m) => n + m.wakes, 0), sleeps: models.reduce((n, m) => n + m.sleeps, 0),
  pairCleanups: models.reduce((n, m) => n + m.pairCleanups, 0),
  midiContributionFramesComputed: true,
  nativeModalHistoriesUsedForPrediction: false, nativeBodyBeforeAudioUsedForPrediction: false,
  nativeCoefficientTablesStillObserved: true, nativeKeyGainsStillObserved: true, initialSleepFlagsStillObserved: true,
  independentEngineStereoVerified: false };
fs.writeFileSync(destination, JSON.stringify(report, null, 2), { flag: 'wx' });
if (outputPath) { if (!passed) throw Error('Only passing key recurrence may export'); fs.writeFileSync(outputPath, audio, { flag: 'wx' }); }
console.log(JSON.stringify(report));
if (!passed || flags.includes('--poison-history-target') && !historyPoisoned || flags.includes('--poison-body-before-target') && !audioPoisoned) process.exitCode = 1;
