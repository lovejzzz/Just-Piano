import fs from 'node:fs';
import { selectSupportRows, supportLogAmplitudes, appendExcitationSupport, appendSecondExcitationSupport } from '../dsp/excitation-append.mjs';
import { randomizeRepeatedExcitation, updateRepeatedSupportHistory } from '../dsp/excitation-repeat.mjs';
const [spectrumPath, hardnessPath, tablePath, beforePath, appendedPath, finalPath, reportPath, ...options] = process.argv.slice(2);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
let repeatBefore, repeatAfter, historyBefore, historyAfter;
if (options.length) {
  if (options.length !== 5 || options[0] !== '--repeat-captures') throw new Error('Expected --repeat-captures randomBefore randomAfter historyBefore historyAfter');
  [repeatBefore, repeatAfter, historyBefore, historyAfter] = options.slice(1).map(read);
  for (const [capture, point] of [[repeatBefore, '0x100695860'], [repeatAfter, '0x100695940'],
    [historyBefore, '0x100695940'], [historyAfter, '0x100696024']])
    if (capture.schema !== 1 || capture.point !== point || capture.errors.length || !capture.records.length)
      throw new Error('Complete repeated-strike stage captures required');
}
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
let repeatIndex = 0, historyIndex = 0;
const histories = new Map();
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
  const primaryHardness = p.hardness?.primary ?? h.primary;
  const logAmplitudes = supportLogAmplitudes({ primary: primaryHardness, spectrum: p, coordinates: t.coordinates,
    baseTable: t.baseTable, indices, tables: a.tables, logOffset: a.controls.logOffset });
  compare(`${index}-support-log`, logAmplitudes, a.logAmplitudes);
  let result = appendExcitationSupport({ ...a, source: p.source, header: p.header, indices, logAmplitudes });
  compare(`${index}-appended-header`, result.appendedHeader, b.header, true);
  for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-appended-${key}`, result.source[key], b.source[key]);
  if (a.controls.repeatFlag === 1 && a.controls.attenuation > 0) {
    if (!repeatBefore) throw new RangeError('Active repeat requires real repeat-stage captures');
    const r = repeatBefore.records[repeatIndex], s = repeatAfter.records[repeatIndex++];
    if (!r || !s || r.note !== p.note || r.mode !== p.mode || s.note !== p.note || s.mode !== p.mode ||
        JSON.stringify(r.header) !== JSON.stringify(result.appendedHeader) || JSON.stringify(s.header) !== JSON.stringify(r.header) ||
        r.baseRows !== p.header[1] || r.controls.repeatFlag !== a.controls.repeatFlag || bits(r.controls.attenuation) !== bits(a.controls.attenuation))
      throw new Error('Repeat source identity differs');
    for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-repeat-input-${key}`, result.source[key], r.source[key]);
    const varied = randomizeRepeatedExcitation({ amplitude: result.source.amplitude, columns: result.header[0],
      baseRows: r.baseRows, randomState: r.randomState, controls: r.controls });
    result.source.amplitude = varied.amplitude;
    compare(`${index}-random-amplitude`, varied.amplitude, s.source.amplitude);
    compare(`${index}-random-state`, varied.randomState, s.randomState, true);
    if (p.mode === 0 && result.appended) {
      const x = historyBefore.records[historyIndex], y = historyAfter.records[historyIndex++];
      if (!x || !y || x.note !== p.note || y.note !== p.note || x.mode !== 0 || y.mode !== 0)
        throw new Error('History source identity differs');
      if (bits(x.controls.attenuation) !== bits(a.controls.attenuation) || JSON.stringify(x.controls) !== JSON.stringify(y.controls) ||
          JSON.stringify(x.header) !== JSON.stringify(result.appendedHeader) || JSON.stringify(y.header) !== JSON.stringify(x.header))
        throw new Error('History control identity differs');
      for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-history-input-${key}`, result.source[key], x.source[key]);
      compare(`${index}-history-seed-input`, varied.randomState, x.randomState, true);
      const previous = histories.has(p.note) ? histories.get(p.note) : x.history;
      compare(`${index}-carried-history`, previous, x.history);
      const updated = updateRepeatedSupportHistory({ amplitude: result.source.amplitude, frequency: result.source.frequency,
        columns: result.header[0], baseRows: x.baseRows, history: previous, count: Math.min(result.appended, 16),
        randomState: varied.randomState, curve: x.curve, controls: x.controls },
      { exp2f: v => Math.fround(2 ** v), log10f: v => Math.fround(Math.log10(v)) });
      compare(`${index}-history-values`, updated.history, y.history);
      compare(`${index}-history-amplitude`, updated.amplitude, y.source.amplitude);
      compare(`${index}-history-random-state`, updated.randomState, y.randomState, true);
      histories.set(p.note, updated.history); result.source.amplitude = updated.amplitude;
    }
  }
  if (a.secondIndices.length) {
    const secondIndices = selectSupportRows({ header: p.header, source: p.preWeightSource,
      frequencies: a.tables.secondFrequencies, referenceFrequency: a.secondReferenceFrequencies[0] });
    compare(`${index}-second-support-indices`, secondIndices, a.secondIndices, true);
    const secondLogAmplitudes = supportLogAmplitudes({ primary: primaryHardness, spectrum: p, coordinates: t.coordinates,
      baseTable: t.baseTable, indices: secondIndices,
      tables: { lowLog: a.tables.secondLowLog, highLog: a.tables.secondHighLog }, logOffset: 0 });
    compare(`${index}-second-support-log`, secondLogAmplitudes, a.secondLogAmplitudes);
    result = appendSecondExcitationSupport(result, { ...a, secondIndices, secondLogAmplitudes });
  }
  compare(`${index}-final-header`, result.header, c.header, true);
  for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-final-${key}`, result.source[key], c.source[key]);
  predictions.push({ note: p.note, mode: p.mode, ...result });
}
if (repeatBefore && (repeatIndex !== repeatBefore.records.length || repeatIndex !== repeatAfter.records.length ||
    historyIndex !== historyBefore.records.length || historyIndex !== historyAfter.records.length))
  throw new Error('Unused repeated-strike observations');
const report = { schema: 'pianoteq-excitation-append-pass30', passed: checks.every(c => !c.mismatches),
  comparedValues: checks.reduce((n, c) => n + c.count, 0), mismatches: checks.reduce((n, c) => n + c.mismatches, 0),
  checks, failures, predictions, weightedSourceCalculated: true, supportLogAmplitudesCalculated: true,
  supportIndicesStillCaptured: false, modelTablesAndControlsStillCaptured: true,
  repeatHistoryVerified: Boolean(repeatBefore), carriedHistoryUpdates: historyIndex,
  nativeScalarExp2Log10AndCosfImplemented: false,
  secondSupportFamilyVerified: before.records.some(r => r.secondIndices.length > 0),
  fullExcitationGenerationVerified: false, wholeVoiceAudioVerified: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
