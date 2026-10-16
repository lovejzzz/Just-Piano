import fs from 'node:fs';
import { mapVoiceSource } from '../dsp/voice-source-mapping.mjs';
import { selectVoiceModes } from '../dsp/voice-mode-selection.mjs';
const [capturePath, outputPath, ...options] = process.argv.slice(2);
let selectionLog, postExcitation, finalExcitation;
for (let i = 0; i < options.length; i += 2) {
  if (!options[i + 1]) throw new Error('Missing report path');
  if (options[i] === '--selection-log' && !selectionLog) selectionLog = JSON.parse(fs.readFileSync(options[i + 1], 'utf8'));
  else if (options[i] === '--post-excitation-report' && !postExcitation) postExcitation = JSON.parse(fs.readFileSync(options[i + 1], 'utf8'));
  else if (options[i] === '--final-excitation-report' && !finalExcitation) finalExcitation = JSON.parse(fs.readFileSync(options[i + 1], 'utf8'));
  else throw new Error('Expected --selection-log, --post-excitation-report or --final-excitation-report');
}
if (postExcitation && finalExcitation) throw new Error('Choose a prefix or complete source report');
if (selectionLog) {
  if (selectionLog.schema !== 1 || selectionLog.point !== '0x100839c50' || selectionLog.errors.length || !selectionLog.records.length)
    throw new Error('Complete threshold log return required');
}
const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
if (capture.schema !== 1 || capture.point !== '0x1009517d8' || capture.errors.length ||
    !capture.records.length || capture.records.length > 16 || (selectionLog && selectionLog.records.length !== capture.records.length))
  throw new Error('Expected complete mapping and matching log captures');
if (postExcitation && (postExcitation.schema !== 'pianoteq-post-excitation-pass24' || postExcitation.passed !== true ||
    postExcitation.mismatches !== 0 || postExcitation.predictions?.length !== capture.records.length))
  throw new Error('Verified matching post-excitation predictions required');
if (finalExcitation && (finalExcitation.schema !== 'pianoteq-final-excitation-pass25' || finalExcitation.passed !== true ||
    finalExcitation.mismatches !== 0 || finalExcitation.predictions?.length !== capture.records.length || finalExcitation.finalSourceTablesCalculated !== true))
  throw new Error('Verified complete final-excitation predictions required');
const checks = [], failures = [], predictions = [];
let computedSelections = 0;
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
  const source = Object.fromEntries(Object.entries(r.source).map(([key, values]) => [key, [...values]]));
  let computedFrequencyDecayPrefix = 0;
  if (finalExcitation) {
    const p = finalExcitation.predictions[recordIndex];
    if (JSON.stringify(p.header) !== JSON.stringify(r.header)) throw new Error('Final source header differs');
    for (const key of ['frequency', 'decay', 'amplitude', 'phase']) {
      compare(`calculated-final-source-${key}`, p.source[key], r.source[key]);
      source[key] = [...p.source[key]];
    }
  }
  if (postExcitation) {
    const p = postExcitation.predictions[recordIndex];
    if (p.header[0] !== columns || p.source.frequency.length !== p.header[1] * columns || p.source.frequency.length > r.source_size)
      throw new Error('Post-excitation prefix has incompatible dimensions');
    computedFrequencyDecayPrefix = p.source.frequency.length;
    for (const key of ['frequency', 'decay']) {
      compare(`post-excitation-${key}-prefix`, p.source[key], r.source[key].slice(0, computedFrequencyDecayPrefix));
      source[key].splice(0, computedFrequencyDecayPrefix, ...p.source[key]);
    }
  }
  let layout = r.layout, indices = r.voice.index, selection;
  if (r.selection_controls) {
    const controls = r.selection_controls, log = selectionLog?.records[recordIndex];
    if (log && bits(log.threshold) !== bits(controls.projectedThreshold)) throw new Error('Threshold identity mismatch');
    selection = selectVoiceModes({ ...controls, bypassAmplitudeFilter: Boolean(controls.bypassAmplitudeFilter),
      source, columns, splitRow: lower });
    computedSelections++;
    if (log) compare('threshold-log2', [selection.logThreshold], [log.log2]);
    compare('selected-layout', selection.layout.flat(), r.layout.flat());
    const valid = r.layout.flatMap(([start, , , count]) => Array.from({ length: count }, (_, i) => start + i));
    compare('selected-indices', valid.map(i => selection.indices[i]), valid.map(i => r.voice.index[i]));
    layout = selection.layout; indices = selection.indices;
  } else if (selectionLog) throw new Error('Selection log supplied without selection controls');
  const predicted = mapVoiceSource({ source, columns, referenceRow, zeroAdjustmentRows: [lower, upper],
    layout, indices });
  // Gaps between groups are not initialized by this gather. Only compare valid
  // lanes and four-lane padding that this native function actually clears.
  const initializedEnd = Math.max(...layout.map(([start, , , count]) => start + count));
  const lanes = layout.flatMap(([start, padded, , count]) =>
    Array.from({ length: Math.max(0, Math.min(initializedEnd, padded, Math.ceil((start + count) / 4) * 4) - start) }, (_, i) => start + i));
  for (const name of ['frequency', 'decay', 'amplitude', 'phase', 'J'])
    compare(name, lanes.map(i => predicted[name][i]), lanes.map(i => r.voice[name][i]));
  compare('referenceDecay', [predicted.referenceDecay], [r.reference_decay]);
  predictions.push({ layout, computedFrequencyDecayPrefix, selectionDecisions: selection?.decisions, lanes: lanes.map(lane => ({ lane,
    ...Object.fromEntries(['frequency', 'decay', 'amplitude', 'phase', 'J'].map(name => [name, predicted[name][lane]])) })) });
}
const report = { schema: 'pianoteq-voice-source-mapping-pass22', passed: checks.every(x => !x.mismatches),
  comparedFloatValues: checks.reduce((n, x) => n + x.count, 0), mismatches: checks.reduce((n, x) => n + x.mismatches, 0),
  checks, failures, predictions, postExcitationSourceStillCaptured: !finalExcitation, indexMapStillCaptured: computedSelections !== capture.records.length,
  finalSourceTablesCalculated: Boolean(finalExcitation), initialExcitationInputsStillCaptured: true,
  secondaryExcitationStillCaptured: finalExcitation?.secondaryExcitationStillCaptured !== false, initialRandomStateStillCaptured: true,
  modeSelectionComputed: computedSelections === capture.records.length, computedSelections, selectionControlsStillCaptured: true,
  nativeScalarLog2Implemented: computedSelections > 0, scalarLog2VerifiedOnlyAtObservedThreshold: false,
  thresholdLogCompared: Boolean(selectionLog),
  postExcitationFrequencyDecayPrefixComputed: Boolean(postExcitation),
  wholeVoiceAudioVerified: false };
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
