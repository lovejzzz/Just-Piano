import fs from 'node:fs';
import { selectSupportRows, supportLogAmplitudes, appendExcitationSupport, appendSecondExcitationSupport } from '../dsp/excitation-append.mjs';
const [spectrumPath, hardnessPath, tablePath, beforePath, appendedPath, finalPath, reportPath] = process.argv.slice(2);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const spectrum = read(spectrumPath), hardness = read(hardnessPath), table = read(tablePath);
const before = read(beforePath), appended = read(appendedPath), final = read(finalPath);
if (spectrum.schema !== 'pianoteq-spectrum-controls-pass29' || !spectrum.passed || spectrum.mismatches || !spectrum.weightedAmplitudesVerified ||
    hardness.schema !== 'pianoteq-excitation-hardness-pass28' || !hardness.passed || hardness.mismatches ||
    table.point !== '0x1006950c8' || table.errors.length ||
    before.point !== '0x100695248' || before.errors.length || appended.point !== '0x100695860' || appended.errors.length ||
    final.point !== '0x100696308' || final.errors.length || !spectrum.predictions.length ||
    [hardness.predictions, table.records, before.records, appended.records, final.records].some(a => a.length !== spectrum.predictions.length))
  throw new Error('Matching verified weighted source, hardness and append captures required');
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
for (const [index, p] of spectrum.predictions.entries()) {
  const a = before.records[index], b = appended.records[index], c = final.records[index], h = hardness.predictions[index], t = table.records[index];
  if ([a, b, c, h, t].some(r => r.note !== p.note || r.mode !== p.mode) || JSON.stringify(a.header) !== JSON.stringify(p.header))
    throw new Error('Source identity differs');
  for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-weighted-${key}`, p.source[key], a.source[key]);
  if (!p.preWeightSource) throw new Error('Computed pre-weight source required; regenerate spectrum report');
  const indices = p.mode === 0 && t.extraControls.direction === 0 ? selectSupportRows({ header: p.header, source: p.preWeightSource,
    frequencies: a.tables.frequencies, referenceFrequency: a.referenceFrequencies[0] }) : [];
  compare(`${index}-support-indices`, indices, a.indices, true);
  const logAmplitudes = supportLogAmplitudes({ primary: h.primary, spectrum: p, coordinates: t.coordinates,
    baseTable: t.baseTable, indices, tables: a.tables, logOffset: a.controls.logOffset });
  compare(`${index}-support-log`, logAmplitudes, a.logAmplitudes);
  let result = appendExcitationSupport({ ...a, source: p.source, header: p.header, indices, logAmplitudes });
  compare(`${index}-appended-header`, result.appendedHeader, b.header, true);
  for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-appended-${key}`, result.source[key], b.source[key]);
  if (a.secondIndices.length) {
    const secondIndices = selectSupportRows({ header: p.header, source: p.preWeightSource,
      frequencies: a.tables.secondFrequencies, referenceFrequency: a.secondReferenceFrequencies[0] });
    compare(`${index}-second-support-indices`, secondIndices, a.secondIndices, true);
    const secondLogAmplitudes = supportLogAmplitudes({ primary: h.primary, spectrum: p, coordinates: t.coordinates,
      baseTable: t.baseTable, indices: secondIndices,
      tables: { lowLog: a.tables.secondLowLog, highLog: a.tables.secondHighLog }, logOffset: 0 });
    compare(`${index}-second-support-log`, secondLogAmplitudes, a.secondLogAmplitudes);
    result = appendSecondExcitationSupport(result, { ...a, secondIndices, secondLogAmplitudes });
  }
  compare(`${index}-final-header`, result.header, c.header, true);
  for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-final-${key}`, result.source[key], c.source[key]);
  predictions.push({ note: p.note, mode: p.mode, ...result });
}
const report = { schema: 'pianoteq-excitation-append-pass30', passed: checks.every(c => !c.mismatches),
  comparedValues: checks.reduce((n, c) => n + c.count, 0), mismatches: checks.reduce((n, c) => n + c.mismatches, 0),
  checks, failures, predictions, weightedSourceCalculated: true, supportLogAmplitudesCalculated: true,
  supportIndicesStillCaptured: false, modelTablesAndControlsStillCaptured: true,
  repeatHistoryVerified: false, secondSupportFamilyVerified: before.records.some(r => r.secondIndices.length > 0),
  fullExcitationGenerationVerified: false, wholeVoiceAudioVerified: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
