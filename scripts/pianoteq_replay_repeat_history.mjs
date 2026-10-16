import fs from 'node:fs';
import { updateRepeatedSupportHistory } from '../dsp/excitation-repeat.mjs';
const [beforePath, afterPath, reportPath, ...options] = process.argv.slice(2);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const before = read(beforePath), after = read(afterPath);
let randomPredictions;
if (options.length) {
  if (options.length !== 2 || options[0] !== '--random-report') throw new Error('Expected --random-report path');
  const random = read(options[1]);
  if (random.schema !== 'pianoteq-repeat-random-pass31' || !random.passed || random.mismatches)
    throw new Error('Verified amplitude randomization report required');
  randomPredictions = random.predictions.filter(r => r.mode === 0);
  if (randomPredictions.length !== before.records.length) throw new Error('Randomization source count differs');
}
if (before.point !== '0x100695940' || after.point !== '0x100696024' || before.errors.length || after.errors.length ||
    !before.records.length || before.records.length !== after.records.length)
  throw new Error('Complete matching history-update captures required');
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
const checks = [], failures = [], predictions = [];
function compare(name, predicted, actual, integer = false) {
  if (predicted.length !== actual.length || !Array.from(predicted).every(Number.isFinite) || !Array.from(actual).every(Number.isFinite))
    throw new Error(`Incomplete ${name}`);
  let mismatches = 0;
  predicted.forEach((x, i) => {
    if (integer ? x !== actual[i] : bits(x) !== bits(actual[i])) {
      mismatches++; if (failures.length < 30) failures.push({ name, index: i, predicted: x, actual: actual[i] });
    }
  }); checks.push({ name, count: predicted.length, mismatches });
}
let history = before.records[0].history;
for (const [index, a] of before.records.entries()) {
  const b = after.records[index];
  if (a.note !== b.note || a.mode !== 0 || b.mode !== 0 || a.baseRows !== b.baseRows ||
      JSON.stringify(a.header) !== JSON.stringify(b.header) || JSON.stringify(a.controls) !== JSON.stringify(b.controls) ||
      JSON.stringify(a.curve) !== JSON.stringify(b.curve)) throw new Error('History source identity differs');
  compare(`${index}-carried-history`, history, a.history);
  let inputSource = a.source, randomState = a.randomState;
  if (randomPredictions) {
    const p = randomPredictions[index];
    if (p.note !== a.note || JSON.stringify(p.header) !== JSON.stringify(a.header)) throw new Error('Randomization source identity differs');
    for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-randomized-${key}`, p.source[key], a.source[key]);
    compare(`${index}-randomized-seed`, p.randomState, a.randomState, true);
    inputSource = p.source; randomState = p.randomState;
  }
  const count = Math.min(a.header[1] - a.baseRows, 16);
  const result = updateRepeatedSupportHistory({ ...a, columns: a.header[0], amplitude: inputSource.amplitude,
    frequency: inputSource.frequency, randomState, history, count }, {
    exp2f: x => Math.fround(2 ** x), log10f: x => Math.fround(Math.log10(x)) });
  compare(`${index}-history`, result.history, b.history);
  compare(`${index}-amplitude`, result.amplitude, b.source.amplitude);
  compare(`${index}-random-state`, result.randomState, b.randomState, true);
  for (const key of ['frequency', 'decay', 'phase']) compare(`${index}-${key}`, a.source[key], b.source[key]);
  predictions.push({ note: a.note, mode: a.mode, ...result });
  history = result.history;
}
const report = { schema: 'pianoteq-repeat-history-pass31', passed: checks.every(c => !c.mismatches),
  comparedValues: checks.reduce((n, c) => n + c.count, 0), mismatches: checks.reduce((n, c) => n + c.mismatches, 0),
  checks, failures, predictions, historyResetFromCaptureBetweenStrikes: false, inputSourcesAndSeedsStillCaptured: true,
  inputFromComputedRandomization: Boolean(randomPredictions),
  nativeScalarExp2AndLog10Implemented: false, browserMathCandidatesVerifiedOnlyThroughObservedOutputs: true,
  wholeVoiceAudioVerified: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
