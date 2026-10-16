import fs from 'node:fs';
import { mapVoiceSource } from '../dsp/voice-source-mapping.mjs';
const [capturePath, outputPath] = process.argv.slice(2);
const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
if (capture.schema !== 1 || capture.point !== '0x1009517d8' || capture.errors.length || capture.records.length !== 1)
  throw new Error('Expected complete single-voice mapping capture');
const checks = [], failures = [], predictions = [];
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
function compare(name, predicted, actual) {
  if (predicted.length !== actual.length || !actual.every(Number.isFinite)) throw new Error('Incomplete comparison');
  let mismatches = 0;
  predicted.forEach((x, i) => {
    if (bits(x) !== bits(actual[i])) {
      mismatches++;
      if (failures.length < 20) failures.push({ name, index: i, predicted: x, actual: actual[i] });
    }
  });
  checks.push({ name, count: predicted.length, mismatches });
}
for (const r of capture.records) {
  const [columns, rows, specialA, specialB, referenceRow, lower, upper] = r.header;
  if (specialA || specialB || rows * columns !== r.source_size) throw new Error('Unverified source mode');
  const predicted = mapVoiceSource({ source: r.source, columns, referenceRow, zeroAdjustmentRows: [lower, upper],
    layout: r.layout, indices: r.voice.index });
  // Gaps between groups are not initialized by this gather. Only compare valid
  // lanes and four-lane padding that this native function actually clears.
  const lanes = r.layout.flatMap(([start, padded, , count]) =>
    Array.from({ length: Math.min(padded, Math.ceil((start + count) / 4) * 4) - start }, (_, i) => start + i));
  for (const name of ['frequency', 'decay', 'amplitude', 'phase', 'J'])
    compare(name, lanes.map(i => predicted[name][i]), lanes.map(i => r.voice[name][i]));
  compare('referenceDecay', [predicted.referenceDecay], [r.reference_decay]);
  predictions.push({ layout: r.layout, lanes: lanes.map(lane => ({ lane,
    ...Object.fromEntries(['frequency', 'decay', 'amplitude', 'phase', 'J'].map(name => [name, predicted[name][lane]])) })) });
}
const report = { schema: 'pianoteq-voice-source-mapping-pass22', passed: checks.every(x => !x.mismatches),
  comparedFloatValues: checks.reduce((n, x) => n + x.count, 0), mismatches: checks.reduce((n, x) => n + x.mismatches, 0),
  checks, failures, predictions, postExcitationSourceStillCaptured: true, indexMapStillCaptured: true,
  wholeVoiceAudioVerified: false };
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
