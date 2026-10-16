import fs from 'node:fs';
import { mergeExcitationSources, varyExcitationPhases } from '../dsp/final-excitation.mjs';
const [postPath, secondaryPath, mergedPath, phasedPath, reportPath] = process.argv.slice(2);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const post = read(postPath), secondary = read(secondaryPath), merged = read(mergedPath), phased = read(phasedPath);
if (post.schema !== 'pianoteq-post-excitation-pass24' || post.passed !== true || post.mismatches !== 0 || !post.predictions?.length)
  throw new Error('Verified post-excitation predictions required');
for (const [capture, stage, point] of [[secondary, 'secondary', '0x10071677c'], [merged, 'merged', '0x100717a8c'], [phased, 'phased', '0x100717cb4']])
  if (capture.schema !== 1 || capture.stage !== stage || capture.point !== point || capture.errors.length ||
      capture.records.length !== post.predictions.length || capture.records.length > 16)
    throw new Error('Complete matching final-excitation stage captures required');
const checks = [], failures = [], predictions = [];
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
function compare(name, predicted, actual, integer = false) {
  if (predicted.length !== actual.length || !Array.from(actual).every(Number.isFinite)) throw new Error(`Incomplete ${name}`);
  let mismatches = 0;
  predicted.forEach((x, i) => {
    if (integer ? x !== actual[i] : bits(x) !== bits(actual[i])) {
      mismatches++;
      if (failures.length < 30) failures.push({ name, index: i, predicted: x, actual: actual[i] });
    }
  });
  checks.push({ name, count: predicted.length, mismatches, integer });
}
for (const [index, p] of post.predictions.entries()) {
  const a = secondary.records[index], b = merged.records[index], c = phased.records[index];
  if ([a, b, c].some(r => r.note !== p.note || JSON.stringify(r.controls) !== JSON.stringify(a.controls)) ||
      JSON.stringify(p.header) !== JSON.stringify(a.header)) throw new Error('Source identity or controls differ');
  const m = mergeExcitationSources({ primary: p.source, primaryHeader: p.header, secondary: a.secondary.source,
    secondaryHeader: a.secondary.header, secondaryStorage: a.secondary.amplitudeStorage, controls: a.controls });
  compare(`${index}-primary-scaled`, m.scaledPrimary.amplitude, a.source.amplitude);
  for (const key of ['frequency', 'decay', 'phase']) compare(`${index}-primary-${key}`, m.scaledPrimary[key], a.source[key]);
  for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-merged-${key}`, m.source[key], b.source[key]);
  compare(`${index}-merged-header`, m.header, b.header, true);
  compare(`${index}-random-before`, a.randomState, b.randomState, true);
  const v = varyExcitationPhases({ frequency: m.source.frequency, phase: m.source.phase, columns: m.header[0],
    phaseSpread: a.controls.phaseSpread, timeSpread: a.controls.timeSpread,
    phaseStartRow: a.controls.phaseStartRow, randomState: a.randomState });
  const source = { ...m.source, phase: v.phase };
  for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-phased-${key}`, source[key], c.source[key]);
  compare(`${index}-phased-header`, m.header, c.header, true);
  compare(`${index}-random-after`, v.randomState, c.randomState, true);
  predictions.push({ note: p.note, header: m.header, source, randomState: v.randomState, randomDraws: v.randomDraws,
    secondaryNorm: m.secondaryNorm, secondaryNormalizationGain: m.secondaryNormalizationGain,
    primaryScaledLanes: m.primaryScaledLanes });
}
const report = { schema: 'pianoteq-final-excitation-pass25', passed: checks.every(x => !x.mismatches),
  comparedValues: checks.reduce((n, x) => n + x.count, 0), mismatches: checks.reduce((n, x) => n + x.mismatches, 0),
  checks, failures, predictions, initialExcitationInputsStillCaptured: true, secondaryExcitationStillCaptured: true,
  initialRandomStateStillCaptured: true, runtimeControlsStillCaptured: true, finalSourceTablesCalculated: true,
  wholeVoiceAudioVerified: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
