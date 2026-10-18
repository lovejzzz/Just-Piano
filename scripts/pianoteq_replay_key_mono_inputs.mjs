import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { accumulateKeyMono64 } from '../dsp/key-mono-accumulation.mjs';
import { midiBlockClock } from '../dsp/midi-block-clock.mjs';

const [directory, destination, ...flags] = process.argv.slice(2);
const outputs = flags.filter(x => x.startsWith('--output-inputs='));
if (!directory || !destination || outputs.length > 1 || flags.some(x => !x.startsWith('--output-inputs=') && x !== '--poison-input-target'))
  throw Error('Usage: complete-private-run fresh-report [--output-inputs=NEW_FILE] [--poison-input-target]');
const outputPath = outputs[0]?.slice('--output-inputs='.length);
for (const file of [destination, outputPath].filter(Boolean))
  if (fs.existsSync(file) || path.resolve(file).startsWith(path.resolve('.') + path.sep)) throw Error('Fresh private artifacts required');
const root = path.resolve(directory), sha = x => crypto.createHash('sha256').update(x).digest('hex');
const bytes = fs.readFileSync(path.join(root, 'runtime.json')), data = JSON.parse(bytes);
const launchBytes = fs.readFileSync(path.join(root, 'launch.json')), launch = JSON.parse(launchBytes);
const monoBytes = fs.readFileSync(path.join(root, data.monoBodyFile)), mono = JSON.parse(monoBytes);
if (!data.keyMonoSourcesObserved || !launch.keyMonoSourcesObserved || !data.monoBodySameRun ||
    !data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.errors.length || data.keyAudioErrors.length || data.downstreamErrors.length ||
    data.targetMutation !== false || data.downstreamPending !== null || data.pendingGlobalContributors.length ||
    data.globalAudioRecords.length !== 2320 || data.keyAudioRecords.length !== 3314 ||
    sha(monoBytes) !== data.monoBodySha256 || mono.runStatus.pid !== data.runStatus.pid || !mono.runStatus.terminal || mono.runStatus.exitStatus !== 0 ||
    mono.errors.length || mono.pending || mono.observations.length !== 2320)
  throw Error('Complete error-free same-run key/mono observations required');
for (const [file, digest] of Object.entries(launch.helperSha256))
  if (sha(fs.readFileSync(path.join(root, '..', file))) !== digest) throw Error('Bound frozen collector required');
if (launch.collectorSha256 !== launch.helperSha256['pianoteq_capture_key_stereo_baseline.py']) throw Error('Bound collector identity required');
const fixture = launch.fixture;
for (const [file, digest] of [[fixture.midiPath, fixture.midiSha256], [fixture.resourcePath, fixture.resourceSha256], [fixture.selection.path, fixture.selection.sha256]])
  if (sha(fs.readFileSync(file)) !== digest) throw Error('Bound fixture input changed');
const clock = midiBlockClock(fs.readFileSync(fixture.midiPath), { sampleRate: 48000 });
if (clock.noteOns.length !== 5) throw Error('Complete primary strike inventory required');
const ages = new Map(), batches = Array.from({ length: 2320 }, () => []);
const word = new DataView(new ArrayBuffer(4));
const bits = x => { if (!Number.isFinite(x)) throw Error('Finite mono value required'); word.setFloat32(0, x, true); return word.getUint32(0, true); };
let checks = 0, mismatches = 0, poisoned = false;
const failures = [];
function check(a, b, label) { checks++; if (!Object.is(a, b)) { mismatches++; if (failures.length < 12) failures.push({ label, computed: a, target: b }); } }
for (const [ordinal, item] of data.keyAudioRecords.entries()) {
  if (item.ordinal !== ordinal || !Number.isInteger(item.epoch) || item.epoch < 0 || item.epoch >= 5) throw Error('Contiguous key inventory required');
  const age = ages.get(item.epoch) ?? 0, block = clock.noteOns[item.epoch].frame / 64 + age / 64;
  check(age, item.voiceBlockCounter, `${ordinal}.age`); check(block, item.globalOrdinal, `${ordinal}.clock`);
  if (block >= batches.length) throw Error('Bound MIDI contribution frame required');
  batches[block].push(item); ages.set(item.epoch, age + 64);
}
const parts = [];
for (const [block, contributors] of batches.entries()) {
  const target = mono.observations[block];
  if (target.ordinal !== block || target.queueBefore.enabled !== 0 || target.queueReturn.enabled !== 0 || target.bodyInputs.length !== 3)
    throw Error('Complete inspected modal branch required');
  const before = [];
  for (const item of contributors) {
    const prior = accumulateKeyMono64(before).slots.get(item.keyIndex);
    check(prior ? 0 : 1, item.slotMonoReset, `${block}.${item.ordinal}.slotReset`);
    if (prior) {
      if (item.slotMonoBefore.length !== 64) throw Error('Complete live slot target required');
      prior.forEach((x, i) => check(bits(x), bits(item.slotMonoBefore[i]), `${block}.${item.ordinal}.slot.${i}`));
    }
    before.push(item);
  }
  const own = accumulateKeyMono64(contributors), rows = [own.firstModal, own.secondModal, own.thirdModal];
  const targets = [target.driveInputBefore, target.bodyInputs[1], target.bodyInputs[2]];
  const encoded = Buffer.alloc(768);
  rows.forEach((row, r) => {
    if (targets[r].length !== 1 || targets[r][0].length !== 64) throw Error('Complete modal input target required');
    row.forEach((x, i) => {
      let actual = bits(targets[r][0][i]);
      if (flags.includes('--poison-input-target') && !poisoned && x !== 0) { actual = (actual ^ 1) >>> 0; poisoned = true; }
      check(bits(x), actual, `${block}.input.${r}.${i}`); encoded.writeFloatLE(x, (r * 64 + i) * 4);
    });
  });
  parts.push(encoded);
}
const audio = Buffer.concat(parts), passed = mismatches === 0;
const report = { schema: 1, passed, captureRuntimeSha256: sha(bytes), monoBodySha256: sha(monoBytes), launchSha256: sha(launchBytes),
  blocks: batches.length, voiceBlocks: data.keyAudioRecords.length, checks, mismatches, failures, poisoned,
  computedKeyInputsSha256: sha(audio), nativeModalInputAudioUsedForPrediction: false, nativeSlotHistoryUsedForPrediction: false,
  nativeMonoVoiceContributionsStillObserved: true, nativeMixLevelsStillObserved: true, nativeKeyIndicesStillObserved: true,
  nativeContributionOrderStillObserved: true, midiContributionFramesComputed: true, directLaneVerified: false, independentEngineStereoVerified: false };
fs.writeFileSync(destination, JSON.stringify(report, null, 2), { flag: 'wx' });
if (outputPath) { if (!passed) throw Error('Only passing key inputs may export'); fs.writeFileSync(outputPath, audio, { flag: 'wx' }); }
console.log(JSON.stringify(report));
if (!passed || flags.includes('--poison-input-target') && !poisoned) process.exitCode = 1;
