import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readComputedDirect } from './pianoteq_feedback_artifact.mjs';
import { GlobalRoomExcitation64 } from '../dsp/global-room-excitation.mjs';

const [directory, destination, ...flags] = process.argv.slice(2);
const directReports = flags.filter(x => x.startsWith('--direct-report=')), directAudio = flags.filter(x => x.startsWith('--direct-audio='));
if (directReports.length > 1 || directAudio.length > 1 || directReports.length !== directAudio.length) throw Error('Paired computed direct source required');
const outputs = flags.filter(x => x.startsWith('--output-excitation='));
if (!directory || !destination || outputs.length > 1 || flags.some(x => !['--output-excitation=', '--direct-report=', '--direct-audio='].some(p => x.startsWith(p)) && !['--poison-room-target', '--poison-ring-target'].includes(x)))
  throw Error('Usage: complete-private-run fresh-report [--output-excitation=NEW_FILE] [--poison-room-target|--poison-ring-target]');
const outputPath = outputs[0]?.slice('--output-excitation='.length);
for (const file of [destination, outputPath].filter(Boolean)) if (fs.existsSync(file) || path.resolve(file).startsWith(path.resolve('.') + path.sep)) throw Error('Fresh private excitation artifacts required');
const root = path.resolve(directory), sha = x => crypto.createHash('sha256').update(x).digest('hex');
const runtime = fs.readFileSync(path.join(root, 'runtime.json')), capture = JSON.parse(runtime);
const source = fs.readFileSync(path.join(root, capture.globalExcitationFile)), data = JSON.parse(source);
const launch = JSON.parse(fs.readFileSync(path.join(root, 'launch.json')));
if (!capture.globalExcitationSameRun || !capture.globalExcitationPassive || !launch.globalExcitationPassive ||
    !data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.runStatus.pid !== capture.runStatus.pid ||
    data.errors.length || data.pending || data.targetMutation !== false || data.records.length !== 2320 ||
    capture.globalExcitationSha256 !== sha(source) || capture.downstreamErrors.length || capture.keyAudioErrors.length || capture.errors.length)
  throw Error('Complete same-run passive excitation capture required');
for (const [file, digest] of Object.entries(launch.helperSha256)) if (sha(fs.readFileSync(path.join(root, '..', file))) !== digest) throw Error('Frozen excitation collector changed');
const ownDirect = directReports.length ? readComputedDirect(root, capture, directReports[0].slice('--direct-report='.length), directAudio[0].slice('--direct-audio='.length)) : null;
const model = new GlobalRoomExcitation64(data.profile);
if (data.records[0].wrapperBefore.previousGains.some(x => !Object.is(x, 0))) throw Error('Verified zero initial room gain history required');
const word = new DataView(new ArrayBuffer(4));
const bits = x => { if (!Number.isFinite(x)) throw Error('Finite room value required'); word.setFloat32(0, x, true); return word.getUint32(0, true); };
let checks = 0, mismatches = 0, ringHashes = 0, poisoned = false, poisonedRing = false, nonzero = 0;
const failures = [], parts = [];
function check(a, b, label) { checks++; if (!Object.is(a, b)) { mismatches++; if (failures.length < 16) failures.push({ label, computed: a, target: b }); } }
function ring(own, actual, label) {
  for (const field of ['capacity', 'width', 'cursor', 'filled']) check(own[field], actual[field], `${label}.${field}`);
  if (actual.pages.length !== own.pages.length) throw Error('Complete room ring page inventory required');
  actual.pages.forEach((page, i) => {
    check(Number(own.empty[i]), page.empty, `${label}.${i}.empty`);
    if (page.sha256) {
      let target = page.sha256;
      if (flags.includes('--poison-ring-target') && !poisonedRing && own.pages[i].some(x => x !== 0)) { target = (target[0] === '0' ? '1' : '0') + target.slice(1); poisonedRing = true; }
      check(sha(Buffer.from(own.pages[i].buffer)), target, `${label}.${i}.history`); ringHashes++;
    }
  });
}
for (const [block, item] of data.records.entries()) {
  if (item.ordinal !== block || !item.passiveBoundaries || item.source.length !== 1 || item.source[0].length !== 64 ||
      item.audioAfter.length !== 2 || item.audioAfter.some(x => x.length !== 64) || item.autoGainEnabled !== 0 ||
      item.wrapperAfter.crossfade !== 0 || item.wrapperAfter.reset !== 0 || item.pedalsBefore.length !== 2 ||
      item.pedalsBefore.some(x => x.parameterValues[0] !== 0)) throw Error('Inspected fixed room, zero-level pedals and bypassed auto-gain required');
  const input = ownDirect ? ownDirect.row(block) : item.source[0];
  if (ownDirect) input.forEach((x, i) => check(bits(x), bits(item.source[0][i]), `${block}.direct.${i}`));
  const output = model.process64(input, item.gains), encoded = Buffer.alloc(512);
  model.damping.forEach((own, i) => ring(own, item.bankAfter.damping[i], `${block}.damping.${i}`));
  model.channels.forEach((own, row) => {
    const actual = item.bankAfter.channels[row];
    check(own.clock, actual.clock, `${block}.${row}.clock`);
    for (const name of ['input', 'sum', 'output']) ring(own[name], actual[name], `${block}.${row}.${name}`);
    if (own.combs.length !== actual.combs.length || own.allpasses.length !== actual.allpasses.length || actual.updateCountdown !== 0) throw Error('Static complete room topology required');
    own.combs.forEach((c, i) => {
      const target = actual.combs[i];
      check(bits(c.damping), bits(target.damping), `${block}.${row}.${i}.damping`); check(bits(c.mix), bits(target.mix), `${block}.${row}.${i}.mix`); check(c.delay, target.delay, `${block}.${row}.${i}.delay`);
      ring(c.ring, target.ring, `${block}.${row}.comb.${i}`);
    });
    own.allpasses.forEach((a, i) => {
      const target = actual.allpasses[i]; check(bits(a.gain), bits(target.gain), `${block}.${row}.${i}.allpassGain`); check(a.delay, target.delay, `${block}.${row}.${i}.allpassDelay`);
      ring(a.ring, target.ring, `${block}.${row}.allpass.${i}`);
    });
    if (own.fir) { check(own.fir.cursor, actual.postFir.cursor, `${block}.${row}.fir.cursor`); check(sha(Buffer.from(own.fir.history.buffer)), actual.postFir.historySha256, `${block}.${row}.fir.history`); }
    output[row].forEach((x, i) => {
      let target = bits(item.audioAfter[row][i]);
      if (flags.includes('--poison-room-target') && !poisoned && x !== 0) { target = (target ^ 1) >>> 0; poisoned = true; }
      check(bits(x), target, `${block}.${row}.audio.${i}`); encoded.writeFloatLE(x, (row * 64 + i) * 4); if (x !== 0) nonzero++;
    });
  });
  parts.push(encoded);
}
const audio = Buffer.concat(parts), passed = mismatches === 0 && nonzero > 0;
const report = { schema: 1, passed, captureRuntimeSha256: sha(runtime), inputSha256: sha(source), blocks: data.records.length,
  checks, mismatches, failures, ringHashes, nonzero, poisoned, poisonedRing, computedExcitationSha256: sha(audio),
  nativeDirectSourceUsedForPrediction: !ownDirect, computedDirectReportSha256: ownDirect?.reportSha256 ?? null, computedDirectAudioSha256: ownDirect?.audioSha256 ?? null, nativeRoomOutputOrRingHistoryUsedForPrediction: false,
  nativeRoomGainsStillObserved: true, nativeRoomStaticProfileStillObserved: true, pedalZeroLevelBranchOnly: true,
  pedalColdEmptyQueueAssumed: true, pedalQueuesObserved: false, independentEngineStereoVerified: false };
fs.writeFileSync(destination, JSON.stringify(report, null, 2), { flag: 'wx' });
if (outputPath) { if (!passed) throw Error('Only passing global excitation may export'); fs.writeFileSync(outputPath, audio, { flag: 'wx' }); }
console.log(JSON.stringify(report));
if (!passed || flags.includes('--poison-room-target') && !poisoned || flags.includes('--poison-ring-target') && !poisonedRing) process.exitCode = 1;
