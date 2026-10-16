import fs from 'node:fs';
import { mixExcitationComponents, archiveExcitationMixCoefficients } from '../dsp/excitation-component-mix.mjs';
const [beforePath, afterPath, reportPath, ...options] = process.argv.slice(2);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
let archivePath, bankIndex, curvePath;
for (let i = 0; i < options.length; i += 2) {
  if (!options[i + 1]) throw new Error('Missing option value');
  if (options[i] === '--base-models') archivePath = options[i + 1];
  else if (options[i] === '--base-index') bankIndex = Number(options[i + 1]);
  else if (options[i] === '--curve-capture') curvePath = options[i + 1];
  else throw new Error('Expected --base-models, --base-index or --curve-capture');
}
let bank, curves;
if (archivePath || curvePath || bankIndex !== undefined) {
  if (!archivePath || !curvePath || !Number.isInteger(bankIndex) || bankIndex < 0) throw new Error('Complete archive binding options required');
  bank = read(archivePath)[bankIndex]; curves = read(curvePath);
  if (!bank || curves.schema !== 1 || curves.point !== '0x100676980' || curves.errors.length || !curves.records.length)
    throw new Error('Decoded bank and complete runtime curve binding required');
}
const before = read(beforePath), after = read(afterPath);
if (before.schema !== 1 || after.schema !== 1 || before.stage !== 'before' || after.stage !== 'after' ||
    before.point !== '0x100692ffc' || after.point !== '0x1006930f0' || before.errors.length || after.errors.length ||
    !before.records.length || before.records.length > 32 || before.records.length !== after.records.length)
  throw new Error('Complete component-mix captures required');
const checks = [], failures = [], predictions = [];
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
function compare(name, predicted, actual) {
  if (predicted.length !== actual.length || !Array.from(actual).every(Number.isFinite)) throw new Error(`Incomplete ${name}`);
  let mismatches = 0;
  predicted.forEach((x, i) => {
    if (bits(x) !== bits(actual[i])) {
      mismatches++;
      if (failures.length < 30) failures.push({ name, index: i, predicted: x, actual: actual[i] });
    }
  });
  checks.push({ name, count: predicted.length, mismatches });
}
if (bank) {
  const compound = bank.fields.find(f => f.object_offset === 0x2548)?.value;
  for (const row of curves.records) for (const [offset, index] of [['0x2600', 2], ['0x2650', 3]]) {
    const observed = row.curves[offset], archived = compound?.curves?.[index];
    if (!archived || observed.dimension !== 3 || observed.log_x !== 0 || observed.special_mode !== 0)
      throw new Error('Unverified coefficient-curve mode');
    compare(`archive-curve-${row.note}-${offset}-x`, archived.x, observed.x);
    compare(`archive-curve-${row.note}-${offset}-y`, archived.y, observed.y);
  }
}
for (const [index, a] of before.records.entries()) {
  const b = after.records[index];
  if (a.note !== b.note || a.mode !== b.mode || JSON.stringify(a.source.header) !== JSON.stringify(b.source.header) ||
      JSON.stringify(a.controls) !== JSON.stringify(b.controls) ||
      JSON.stringify(a.coefficientA) !== JSON.stringify(b.coefficientA) || JSON.stringify(a.coefficientB) !== JSON.stringify(b.coefficientB))
    throw new Error('Mismatched source identity or controls');
  const coefficients = bank ? archiveExcitationMixCoefficients(bank, a.note, { runtimeMode: 'linear-clamp' }) : a;
  if (bank) {
    compare(`${index}-archive-coefficientA`, coefficients.coefficientA, a.coefficientA);
    compare(`${index}-archive-coefficientB`, coefficients.coefficientB, a.coefficientB);
  }
  const p = mixExcitationComponents({ amplitude: a.source.source.amplitude, columns: a.source.header[0],
    coefficientA: coefficients.coefficientA, coefficientB: coefficients.coefficientB, ...a.controls,
    attenuation: a.controls.soft, inputBlend: a.inputBlend });
  compare(`${index}-amplitude`, p.amplitude, b.source.source.amplitude);
  for (const key of ['frequency', 'decay', 'phase']) compare(`${index}-${key}`, a.source.source[key], b.source.source[key]);
  predictions.push({ note: a.note, mode: a.mode, header: a.source.header, ...p,
    source: { ...a.source.source, amplitude: p.amplitude } });
}
const report = { schema: 'pianoteq-excitation-component-mix-pass26', passed: checks.every(x => !x.mismatches),
  comparedFloatValues: checks.reduce((n, x) => n + x.count, 0), mismatches: checks.reduce((n, x) => n + x.mismatches, 0),
  checks, failures, predictions, initialSourceTablesStillCaptured: true,
  runtimeCoefficientsStillCaptured: !bank, runtimeControlsStillCaptured: true, archiveCoefficientsComputed: Boolean(bank),
  fullExcitationGenerationVerified: false, wholeVoiceAudioVerified: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
