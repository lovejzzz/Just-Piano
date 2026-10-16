import fs from 'node:fs';
import { randomizeRepeatedExcitation } from '../dsp/excitation-repeat.mjs';
const [beforePath, afterPath, reportPath] = process.argv.slice(2);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const before = read(beforePath), after = read(afterPath);
if (before.schema !== 1 || after.schema !== 1 || before.point !== '0x100695860' || after.point !== '0x100695940' ||
    before.errors.length || after.errors.length || !before.records.length || before.records.length !== after.records.length)
  throw new Error('Complete matching active-repeat captures required');
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
for (const [index, a] of before.records.entries()) {
  const b = after.records[index];
  if (a.note !== b.note || a.mode !== b.mode || a.baseRows !== b.baseRows || JSON.stringify(a.header) !== JSON.stringify(b.header) ||
      JSON.stringify(a.controls) !== JSON.stringify(b.controls)) throw new Error('Repeated-strike source identity differs');
  const result = randomizeRepeatedExcitation({ amplitude: a.source.amplitude, columns: a.header[0], baseRows: a.baseRows,
    randomState: a.randomState, controls: a.controls });
  compare(`${index}-amplitude`, result.amplitude, b.source.amplitude);
  compare(`${index}-random-state`, result.randomState, b.randomState, true);
  for (const key of ['frequency', 'decay', 'phase']) compare(`${index}-${key}`, a.source[key], b.source[key]);
  predictions.push({ note: a.note, mode: a.mode, header: a.header, source: { ...a.source, amplitude: result.amplitude },
    randomState: result.randomState, randomDraws: result.randomDraws });
}
const report = { schema: 'pianoteq-repeat-random-pass31', passed: checks.every(c => !c.mismatches),
  comparedValues: checks.reduce((n, c) => n + c.count, 0), mismatches: checks.reduce((n, c) => n + c.mismatches, 0),
  checks, failures, predictions, initialRandomStatesStillCaptured: true, inputSourceTablesStillCaptured: true,
  supportHistoryVerified: false, wholeVoiceAudioVerified: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
