import fs from 'node:fs';
import { excitationSpectrumControls, excitationExtraTable, prepareExcitationWeightSource } from '../dsp/excitation-spectrum-controls.mjs';
import { buildLogSpectrum, nativeExpWeights, applyModalWeight } from '../dsp/excitation-spectrum.mjs';
import { excitationHardness } from '../dsp/excitation-hardness.mjs';
const [hardnessPath, controlsPath, spectrumPath, reportPath, ...options] = process.argv.slice(2);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
let before, after, position, positionComputed = false, embeddedHardness = false;
while (options.length) {
  const option = options.shift();
  if (option === '--embedded-hardness') { embeddedHardness = true; continue; }
  if (option === '--position-report') {
    position = read(options.shift());
    if (position.schema !== 'pianoteq-excitation-position-pass27' || !position.passed || position.mismatches)
      throw new Error('Verified computed position report required');
    positionComputed = true;
    continue;
  }
  if (option === '--position-capture') {
    const capture = read(options.shift());
    if (capture.point !== '0x100693ff8' || capture.errors.length || !capture.records.length)
      throw new Error('Complete native post-position source capture required');
    position = { predictions: capture.records }; positionComputed = false;
    continue;
  }
  if (option !== '--weight-captures' || options.length < 2) throw new Error('Expected --weight-captures before after or --position-report path');
  before = read(options.shift()); after = read(options.shift());
  if (before.point !== '0x100695108' || after.point !== '0x100695248' || before.errors.length || after.errors.length)
    throw new Error('Complete exponent and weighted-amplitude captures required');
}
const hardness = read(hardnessPath), early = read(controlsPath), late = read(spectrumPath);
if (hardness.schema !== 'pianoteq-excitation-hardness-pass28' || !hardness.passed || hardness.mismatches ||
    early.point !== '0x100694148' || late.point !== '0x1006950c8' || early.errors.length || late.errors.length ||
    !hardness.predictions.length || early.records.length !== hardness.predictions.length || late.records.length !== early.records.length)
  throw new Error('Matching verified hardness and native spectrum captures required');
if (before && (before.records.length !== early.records.length || after.records.length !== early.records.length))
  throw new Error('Weight capture source count differs');
if (position && (!before || position.predictions.length !== early.records.length)) throw new Error('Matching position and weight captures required');
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
const checks = [], failures = [], predictions = [], crossCaptureHardnessDifferences = [];
function compare(name, predicted, actual) {
  if (predicted.length !== actual.length || !Array.from(predicted).every(Number.isFinite) || !Array.from(actual).every(Number.isFinite))
    throw new Error(`Incomplete ${name}`);
  let mismatches = 0;
  predicted.forEach((x, i) => {
    if (bits(x) !== bits(actual[i])) {
      mismatches++;
      if (failures.length < 30) failures.push({ name, index: i, predicted: x, actual: actual[i] });
    }
  });
  checks.push({ name, count: predicted.length, mismatches });
}
for (const [index, p] of hardness.predictions.entries()) {
  const a = early.records[index], b = late.records[index];
  if (a.note !== p.note || b.note !== p.note || a.mode !== p.mode || b.mode !== p.mode ||
      JSON.stringify(a.controls) !== JSON.stringify(b.controls)) throw new Error('Control identity differs');
  let earlyHardness = p, spectrumHardness = p;
  if (embeddedHardness) {
    if (!a.hardnessInputs || !b.hardnessInputs) throw new Error('Same-invocation hardness inputs required at both stages');
    const math = { cosf: x => Math.fround(Math.cos(x)) };
    earlyHardness = excitationHardness(a.hardnessInputs, math);
    spectrumHardness = excitationHardness(b.hardnessInputs, math);
    const keys = Object.keys(a.hardnessInputs.controls).filter(k => JSON.stringify(a.hardnessInputs.controls[k]) !== JSON.stringify(b.hardnessInputs.controls[k]));
    if (keys.length) crossCaptureHardnessDifferences.push({ index, note: p.note, mode: p.mode, keys,
      early: Object.fromEntries(keys.map(k => [k, a.hardnessInputs.controls[k]])),
      spectrum: Object.fromEntries(keys.map(k => [k, b.hardnessInputs.controls[k]])) });
  }
  compare(`${index}-hardness-input`, [earlyHardness.primary, earlyHardness.secondary], [a.input.primary, a.input.secondary]);
  const earlyControls = excitationSpectrumControls(earlyHardness, a.controls);
  compare(`${index}-early-controls`, [earlyControls.slope, earlyControls.referenceNumerator], [a.actual.slope, a.actual.referenceNumerator]);
  const c = excitationSpectrumControls(spectrumHardness, b.controls);
  const keys = ['slope', 'baseScale', 'reference', 'lower'];
  compare(`${index}-spectrum-controls`, keys.map(k => c[k]), keys.map(k => b.actual[k]));
  const extraTable = excitationExtraTable({ count: b.count, tables: b.extraTables, controls: b.extraControls });
  compare(`${index}-extra-table`, extraTable, b.actual.extraTable);
  const logSpectrum = buildLogSpectrum({ ...c, count: b.count, coordinates: b.coordinates, baseTable: b.baseTable, extraTable });
  compare(`${index}-log-spectrum`, logSpectrum, b.actual.logSpectrum);
  const expWeights = nativeExpWeights(logSpectrum);
  let source, header, preWeightSource;
  if (before) {
    const x = before.records[index], y = after.records[index];
    if (x.note !== p.note || y.note !== p.note || x.mode !== p.mode || y.mode !== p.mode ||
        JSON.stringify(x.table.header) !== JSON.stringify(y.table.header)) throw new Error('Weight source identity differs');
    header = x.table.header;
    const [columns, rows] = header;
    if (rows !== b.count || x.table.size !== rows * columns) throw new Error('Weight source dimensions differ');
    compare(`${index}-exp-weights`, expWeights, x.expWeights);
    compare(`${index}-preserved-weights`, expWeights, y.expWeights);
    let inputSource = x.table.source;
    if (position) {
      const q = position.predictions[index];
      if (q.note !== p.note || q.mode !== p.mode || JSON.stringify(q.header) !== JSON.stringify(header))
        throw new Error('Position source identity differs');
      const prepared = prepareExcitationWeightSource(q, a.neighborControls);
      for (const key of ['frequency', 'decay', 'amplitude', 'phase'])
        compare(`${index}-prepared-${key}`, prepared.source[key], x.table.source[key]);
      inputSource = prepared.source;
    }
    preWeightSource = Object.fromEntries(Object.entries(inputSource).map(([key, values]) => [key, Array.from(values)]));
    source = { ...inputSource, amplitude: Array.from(inputSource.amplitude, (a, i) => applyModalWeight(a, expWeights[Math.floor(i / columns)])) };
    for (const key of ['frequency', 'decay', 'amplitude', 'phase'])
      compare(`${index}-weighted-${key}`, source[key], y.table.source[key]);
  }
  predictions.push({ note: p.note, mode: p.mode, hardness: spectrumHardness, ...c, extraTable: [...extraTable], logSpectrum: [...logSpectrum],
    expWeights: [...expWeights], ...(source ? { header, preWeightSource,
      source: Object.fromEntries(Object.entries(source).map(([key, values]) => [key, Array.from(values)])) } : {}) });
}
const report = { schema: 'pianoteq-spectrum-controls-pass29', passed: checks.every(c => !c.mismatches),
  comparedFloatValues: checks.reduce((n, c) => n + c.count, 0), mismatches: checks.reduce((n, c) => n + c.mismatches, 0),
  checks, failures, predictions, hardnessFromComputedReport: !embeddedHardness,
  hardnessFromSameInvocationInputs: embeddedHardness, crossCaptureHardnessDifferences,
  nativeScalarCosfImplemented: false, modelTablesAndControlsStillCaptured: true,
  nativeExpOutputsVerifiedThisPass: Boolean(before), weightedAmplitudesVerified: Boolean(before),
  preWeightSourceFromComputedPosition: positionComputed, sourcePreparationVerified: Boolean(position),
  postPositionSourceStillCaptured: !positionComputed, preWeightSourceTablesStillCaptured: !position,
  initialSourceGenerationStillCaptured: true, fullExcitationGenerationVerified: false, wholeVoiceAudioVerified: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
