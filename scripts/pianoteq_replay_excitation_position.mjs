import fs from 'node:fs';
import { correctExcitationPosition } from '../dsp/excitation-position.mjs';
const [mixPath, mixedCapturePath, positionPath, reportPath, ...options] = process.argv.slice(2);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
let rowCapture;
if (options.length) {
  if (options.length !== 2 || options[0] !== '--row-capture' || !options[1]) throw new Error('Expected --row-capture path');
  rowCapture = read(options[1]);
  if (rowCapture.schema !== 1 || rowCapture.point !== '0x100693614' || rowCapture.errors.length || !Array.isArray(rowCapture.records))
    throw new Error('Complete weighted-sum and log-ratio capture required');
}
const mix = read(mixPath), mixed = read(mixedCapturePath), capture = read(positionPath);
if (mix.schema !== 'pianoteq-excitation-component-mix-pass26' || mix.passed !== true || mix.mismatches !== 0 ||
    mixed.schema !== 1 || mixed.point !== '0x1006930f0' || mixed.stage !== 'after' || mixed.errors.length ||
    capture.schema !== 1 || capture.point !== '0x100693e24' || capture.errors.length ||
    !mix.predictions.length || capture.records.length !== mix.predictions.length || mixed.records.length !== capture.records.length)
  throw new Error('Matching calculated mix, before-position and after-position captures required');
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
const checks = [], failures = [], predictions = [];
const usedRows = new Set();
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
for (const [index, p] of mix.predictions.entries()) {
  const a = mixed.records[index], b = capture.records[index];
  if (a.note !== p.note || b.note !== p.note || a.mode !== p.mode || b.mode !== p.mode ||
      JSON.stringify(a.source.header) !== JSON.stringify(p.header) || JSON.stringify(b.header) !== JSON.stringify(p.header))
    throw new Error('Source identity or dimensions differ');
  for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-calculated-mix-${key}`, p.source[key], a.source.source[key]);
  const result = correctExcitationPosition({ amplitude: p.source.amplitude, columns: p.header[0],
    coordinates: b.coordinates, sineWeights: b.sineWeights, ...b.controls }, { sinf: x => Math.fround(Math.sin(x)) });
  const source = { ...p.source, amplitude: result.amplitude };
  if (rowCapture) for (const [row, controls] of result.rowControls.entries()) {
    const matches = rowCapture.records.map((r, i) => ({ r, i })).filter(({ r }) => r.note === p.note && r.mode === p.mode && r.row === row);
    if (matches.length !== 1 || usedRows.has(matches[0].i)) throw new Error('Missing or ambiguous position row');
    const { r, i } = matches[0]; usedRows.add(i);
    const keys = ['referenceSum', 'positionSum', 'offset', 'logRatio'];
    compare(`${index}-row-${row}`, keys.map(k => controls[k]), keys.map(k => r[k]));
  }
  for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-position-${key}`, source[key], b.source[key]);
  predictions.push({ note: p.note, mode: p.mode, header: p.header, source, ...result });
}
if (rowCapture && usedRows.size !== rowCapture.records.length) throw new Error('Unmatched position-row observations');
const report = { schema: 'pianoteq-excitation-position-pass27', passed: checks.every(x => !x.mismatches),
  comparedFloatValues: checks.reduce((n, x) => n + x.count, 0), mismatches: checks.reduce((n, x) => n + x.mismatches, 0),
  checks, failures, predictions, sourceFromCalculatedComponentMix: true, inputSourceGenerationStillCaptured: true,
  positionControlsAndSineWeightsStillCaptured: true, nativeScalarSinfImplemented: false,
  browserSineVerifiedOnlyThroughObservedOutputs: true, optionalPhaseFlagsVerified: false,
  directPositionRowsVerified: Boolean(rowCapture),
  fullExcitationGenerationVerified: false, wholeVoiceAudioVerified: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
