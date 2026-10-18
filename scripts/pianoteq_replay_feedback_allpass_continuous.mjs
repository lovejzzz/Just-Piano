import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { readComputedMono } from './pianoteq_feedback_artifact.mjs';
import { ScalarAllpass } from '../dsp/scalar-allpass.mjs';
import { createRoutedDelayCache, routeConstantBlock, readRoutedBlock } from '../dsp/routed-delay-cache.mjs';

const [input, destination, ...options] = process.argv.slice(2);
if (!input || !destination || options.some(x => x !== '--poison-output-target' && !['--output-feedback=', '--mono-report=', '--mono-audio='].some(p => x.startsWith(p)))) throw Error('Usage: replay INPUT REPORT [--poison-output-target] [--output-feedback=NEW_FILE] [--mono-report=REPORT --mono-audio=AUDIO]');
if (fs.existsSync(destination)) throw Error('Fresh report required');
const feedbackPath = options.find(x => x.startsWith('--output-feedback='))?.slice('--output-feedback='.length);
if (feedbackPath && fs.existsSync(feedbackPath)) throw Error('Fresh feedback artifact required');
const raw = fs.readFileSync(input), capture = JSON.parse(raw);
if (!capture.runStatus?.terminal || capture.runStatus.exitStatus !== 0 || capture.errors.length || capture.pending || capture.targetMutation !== false || !capture.observations.length) throw Error('Complete successful observation required');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const monoReportPath = options.find(x => x.startsWith('--mono-report='))?.slice('--mono-report='.length);
const monoAudioPath = options.find(x => x.startsWith('--mono-audio='))?.slice('--mono-audio='.length);
if (!!monoReportPath !== !!monoAudioPath) throw Error('Paired mono inputs required');
let ownMono = null;
if (monoReportPath) {
  const root = path.dirname(path.resolve(input)), full = JSON.parse(fs.readFileSync(path.join(root, 'runtime.json')));
  if (full.feedbackLatticeSha256 !== sha(raw)) throw Error('Same-run lattice sidecar required');
  ownMono = readComputedMono(root, full, monoReportPath, monoAudioPath);
}
let checks = 0, mismatches = 0, nonzero = 0, poisoned = false;
const examples = [], outputs = [];
function check(actual, expected, label) {
  checks++;
  if (!Object.is(actual, expected)) {
    mismatches++;
    if (examples.length < 8) examples.push({ label, actual, expected });
  }
}
const geometry = f => ({ length: f.length, write: f.write, read: f.read, taps: f.taps });
const first = capture.observations[0];
const filters = first.before.map(f => new ScalarAllpass(geometry(f)));
const withRoute = !!first.routeBefore;
const route = withRoute ? createRoutedDelayCache(first.routeBefore.cache) : null;
const word = new DataView(new ArrayBuffer(4));
const fromBits = x => { word.setUint32(0, x, true); return word.getFloat32(0, true); };
const entries = withRoute ? first.routeBefore.entries.map(e => {
  if (e.tapWords.length !== 6) throw Error('Single route tap required');
  const w = e.tapWords.map(fromBits);
  return { source: e.source, destination: e.destination, taps: [{ delay: w[0], startGain: w[1], endGain: w[2], multiplier: w[4] }] };
}) : null;
const feedback = [];
function checkCache(target, label) {
  check(route.sampleRate, target.sampleRate, `${label}.rate`);
  check(route.maximumDelay, target.maximumDelay, `${label}.maximumDelay`);
  for (let row = 0; row < 3; row++) {
    const own = route.rings[row], observed = target.rings[row];
    for (const field of ['smallChunk', 'bigChunk', 'total', 'head']) check(own[field], observed[field], `${label}.${row}.${field}`);
    check(JSON.stringify([...own.flags]), JSON.stringify(observed.flags), `${label}.${row}.flags`);
  }
}
for (let row = 0; row < filters.length; row++) {
  first.before[row].ring.forEach((x, i) => check(filters[row].ring[i], x, `initial.${row}.${i}`));
}
for (let block = 0; block < capture.observations.length; block++) {
  const item = capture.observations[block];
  if (!!item.routeBefore !== withRoute) throw Error('Incomplete route coverage');
  const blockOutput = [];
  const source = ownMono ? ownMono.row(block) : Float32Array.from(item.source[0]);
  if (ownMono) source.forEach((x, i) => check(x, item.source[0][i], `${block}.computedMono.${i}`));
  check(item.postFilterEnabled, 0, `postfilter.${block}`);
  if (item.source.length !== 1 || item.source[0].length !== 64 || item.output.length !== 3) throw Error('Unsupported matrix');
  for (let row = 0; row < 3; row++) {
    const filter = filters[row], before = item.before[row], after = item.after[row];
    for (const [phase, target] of [['before', before]]) {
      check(filter.write, target.write, `${block}.${row}.${phase}.write`);
      check(filter.read, target.read, `${block}.${row}.${phase}.read`);
      check(sha(Buffer.from(filter.ring.buffer)), target.ringSha256, `${block}.${row}.${phase}.ring`);
      check(JSON.stringify(filter.taps), JSON.stringify(target.taps), `${block}.${row}.${phase}.taps`);
    }
    const output = filter.process(source);
    blockOutput.push(output);
    outputs.push(Buffer.from(output.buffer));
    output.forEach((x, i) => {
      if (x !== 0) nonzero++;
      let target = item.output[row][i];
      if (options.includes('--poison-output-target') && !poisoned && x !== 0) { target = Math.fround(target + 0.125); poisoned = true; }
      check(x, target, `${block}.${row}.output.${i}`);
    });
    check(filter.write, after.write, `${block}.${row}.after.write`);
    check(filter.read, after.read, `${block}.${row}.after.read`);
    check(sha(Buffer.from(filter.ring.buffer)), after.ringSha256, `${block}.${row}.after.ring`);
  }
  if (withRoute) {
    if (!item.feedbackOutput || !item.routeAfter || !item.wrapperOutput) throw Error('Missing complete routing return');
    blockOutput.forEach((row, r) => row.forEach((x, i) => check(x, item.wrapperOutput[r][i], `${block}.wrapper.${r}.${i}`)));
    check(JSON.stringify(item.routeBefore.entries), JSON.stringify(first.routeBefore.entries), `${block}.mapping`);
    check(item.routeBefore.wrap, first.routeBefore.wrap, `${block}.wrap`);
    checkCache(item.routeBefore.cache, `${block}.routeBefore`);
    routeConstantBlock(route, blockOutput, entries, 1, !!first.routeBefore.wrap);
    const routed = readRoutedBlock(route);
    routed.forEach((row, r) => {
      feedback.push(Buffer.from(row.buffer));
      row.forEach((x, i) => check(x, item.feedbackOutput[r][i], `${block}.feedback.${r}.${i}`));
    });
    checkCache(item.routeAfter.cache, `${block}.routeAfter`);
  }
}
const report = { schema: 1, inputSha256: sha(raw), blocks: capture.observations.length,
  checks, mismatches, examples, nonzero, computedOutputSha256: sha(Buffer.concat(outputs)),
  poisoned, nativeMonoSourceUsedForPrediction: !ownMono, observedInitialGeometryUsed: true,
  computedMonoReportSha256: ownMono?.reportSha256 ?? null, computedMonoAudioSha256: ownMono?.audioSha256 ?? null,
  feedbackRouteVerified: withRoute && mismatches === 0, computedFeedbackSha256: withRoute ? sha(Buffer.concat(feedback)) : null,
  nativeOutputOrRingHistoryUsedForPrediction: false, independentEngineStereoVerified: false };
fs.writeFileSync(destination, JSON.stringify(report, null, 2), { flag: 'wx' });
if (feedbackPath) {
  if (!withRoute || mismatches || !nonzero) throw Error('Only a complete passing route may export feedback');
  fs.writeFileSync(feedbackPath, Buffer.concat(feedback), { flag: 'wx' });
}
console.log(JSON.stringify(report));
if (mismatches || !nonzero || (options.includes('--poison-output-target') && !poisoned)) process.exitCode = 1;
