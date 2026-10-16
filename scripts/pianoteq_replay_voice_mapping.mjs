import fs from 'node:fs';
import { mapVoiceSource } from '../dsp/voice-source-mapping.mjs';
import { selectVoiceModes } from '../dsp/voice-mode-selection.mjs';
const [capturePath, outputPath, ...options] = process.argv.slice(2);
let selectionLog;
if (options.length) {
  if (options.length !== 2 || options[0] !== '--selection-log') throw new Error('Expected --selection-log capture');
  selectionLog = JSON.parse(fs.readFileSync(options[1], 'utf8'));
  if (selectionLog.schema !== 1 || selectionLog.point !== '0x100839c50' || selectionLog.errors.length || !selectionLog.records.length)
    throw new Error('Complete threshold log return required');
}
const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
if (capture.schema !== 1 || capture.point !== '0x1009517d8' || capture.errors.length ||
    !capture.records.length || capture.records.length > 16 || (selectionLog && selectionLog.records.length !== capture.records.length))
  throw new Error('Expected complete mapping and matching log captures');
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
for (const [recordIndex, r] of capture.records.entries()) {
  const [columns, rows, specialA, specialB, referenceRow, lower, upper] = r.header;
  if (specialA || specialB || rows * columns !== r.source_size) throw new Error('Unverified source mode');
  let layout = r.layout, indices = r.voice.index, selection;
  if (selectionLog) {
    const controls = r.selection_controls, log = selectionLog.records[recordIndex];
    if (!controls || bits(log.threshold) !== bits(controls.projectedThreshold)) throw new Error('Threshold identity mismatch');
    selection = selectVoiceModes({ ...controls, bypassAmplitudeFilter: Boolean(controls.bypassAmplitudeFilter),
      source: r.source, columns, splitRow: lower }, { log2f: x => Math.fround(Math.log2(x)) });
    compare('threshold-log2', [selection.logThreshold], [log.log2]);
    compare('selected-layout', selection.layout.flat(), r.layout.flat());
    const valid = r.layout.flatMap(([start, , , count]) => Array.from({ length: count }, (_, i) => start + i));
    compare('selected-indices', valid.map(i => selection.indices[i]), valid.map(i => r.voice.index[i]));
    layout = selection.layout; indices = selection.indices;
  }
  const predicted = mapVoiceSource({ source: r.source, columns, referenceRow, zeroAdjustmentRows: [lower, upper],
    layout, indices });
  // Gaps between groups are not initialized by this gather. Only compare valid
  // lanes and four-lane padding that this native function actually clears.
  const initializedEnd = Math.max(...r.layout.map(([start, , , count]) => start + count));
  const lanes = r.layout.flatMap(([start, padded, , count]) =>
    Array.from({ length: Math.max(0, Math.min(initializedEnd, padded, Math.ceil((start + count) / 4) * 4) - start) }, (_, i) => start + i));
  for (const name of ['frequency', 'decay', 'amplitude', 'phase', 'J'])
    compare(name, lanes.map(i => predicted[name][i]), lanes.map(i => r.voice[name][i]));
  compare('referenceDecay', [predicted.referenceDecay], [r.reference_decay]);
  predictions.push({ layout, selectionDecisions: selection?.decisions, lanes: lanes.map(lane => ({ lane,
    ...Object.fromEntries(['frequency', 'decay', 'amplitude', 'phase', 'J'].map(name => [name, predicted[name][lane]])) })) });
}
const report = { schema: 'pianoteq-voice-source-mapping-pass22', passed: checks.every(x => !x.mismatches),
  comparedFloatValues: checks.reduce((n, x) => n + x.count, 0), mismatches: checks.reduce((n, x) => n + x.mismatches, 0),
  checks, failures, predictions, postExcitationSourceStillCaptured: true, indexMapStillCaptured: !selectionLog,
  modeSelectionComputed: Boolean(selectionLog), selectionControlsStillCaptured: true,
  scalarLog2VerifiedOnlyAtObservedThreshold: Boolean(selectionLog),
  wholeVoiceAudioVerified: false };
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
