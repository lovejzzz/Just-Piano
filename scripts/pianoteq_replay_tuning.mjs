// Usage: node SCRIPT base.json preset.json final.json stretched.json anchor.json oracle [report]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { equalTemperamentBase, stretchFrequency, anchorFrequencyScale, finishTuning } from '../dsp/source-tuning.mjs';
const [basePath, presetPath, finalPath, stretchedPath, anchorPath, oracle, reportPath, ...options] = process.argv.slice(2);
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const base = read(basePath)[0], preset = read(presetPath);
const final = read(finalPath), stretched = read(stretchedPath), anchor = read(anchorPath);
for (const data of [final, stretched, anchor]) if (!data.records.length || data.errors.length) throw new Error('Incomplete capture');
if (final.point !== '0x1008a3c60' || stretched.point !== '0x1009626b4' || anchor.point !== '0x1004c3898' ||
    final.configurations.length !== 1 || stretched.configurations.length !== 1) throw new Error('Unexpected capture stages');
const cfg = stretched.configurations[0], b = new Map(base.fields.map(x => [x.object_offset, x.value]));
let stretchTable = cfg.stretch_table, stretchTableComputedFromSystem = false, stretchRhsStillCaptured = true;
if (options.length) {
  if (options.length !== 2 || options[0] !== '--stretch-report') throw new Error('Expected --stretch-report path');
  const report = read(options[1]);
  if (!['pianoteq-stretch-system-pass18', 'pianoteq-stretch-rhs-pass19'].includes(report.schema) || report.passed !== true ||
      report.predictedTable?.length !== 128 || !report.predictedTable.every(Number.isFinite) ||
      !report.checks.some(x => x.name === 'frequency-table' && x.count === 128 && x.bitExact === true && x.mismatches === 0))
    throw new Error('Verified computed stretch table required');
  stretchTable = report.predictedTable;
  stretchTableComputedFromSystem = true;
  if (report.schema === 'pianoteq-stretch-rhs-pass19') {
    if (report.rhsStillCaptured !== false || !report.checks.some(x => x.name === 'complete-rhs' && x.count === 203 && x.bitExact === true && x.mismatches === 0))
      throw new Error('Verified computed stretch RHS required');
    stretchRhsStillCaptured = false;
  }
}
const a = new Map(preset.decoded_tail.fields.map(x => [x.object_offset, x.value]));
const tuning = a.get(0x318), pitchCurve = a.get(0x3b0), observedCurve = cfg.pitch_edits;
const word = new DataView(new ArrayBuffer(8));
const bits = value => { word.setFloat64(0, value); return word.getBigUint64(0).toString(16).padStart(16, '0'); };
const decode = text => { word.setBigUint64(0, BigInt('0x' + text)); return word.getFloat64(0); };
const same = (x, y) => bits(Math.fround(x)) === bits(Math.fround(y));
if (!stretchTable.every((x, i) => same(x, cfg.stretch_table[i]))) throw new Error('Computed stretch table differs from tuning capture');
if (!same(b.get(0x1b34), cfg.tuning_controls['0x20']) || cfg.tuning_controls['0x280'] !== 0 ||
    cfg.tuning_integers['0x190'] !== 1 ||
    pitchCurve.x.length !== observedCurve.x.length || pitchCurve.y.length !== observedCurve.y.length ||
    !pitchCurve.x.every((v, j) => same(v, observedCurve.x[j])) || !pitchCurve.y.every((v, j) => same(v, observedCurve.y[j])))
  throw new Error('Archive reference/pitch curve or supported tuning branch differs');
if (!anchor.records.every(row => JSON.stringify(row) === JSON.stringify(anchor.records[0])))
  throw new Error('Anchor constants differ across render passes');
const observedAnchor = anchor.records[0];
if (!same(observedAnchor.target_frequency, tuning.midi.float)) throw new Error('Anchor target differs from archive');
const nativeCalls = new Map();
const math = Object.fromEntries(['exp2f', 'exp2'].map(name => [name, value => {
  const input = bits(value), key = `${name}:${input}`;
  if (!nativeCalls.has(key)) {
    const result = spawnSync(oracle, [name, input], { encoding: 'utf8' });
    if (result.status !== 0 || !/^[0-9a-f]{16}\s*$/.test(result.stdout)) throw new Error('Independent system math oracle failed');
    nativeCalls.set(key, { name, input, output: result.stdout.trim() });
  }
  return decode(nativeCalls.get(key).output);
}]));
const prepared = new Map();
for (const record of final.records) {
  const key = `${record.note_index}:${record.note}`;
  if (prepared.has(key)) continue;
  const baseline = equalTemperamentBase(record.note, tuning, math);
  const stretch = stretchFrequency({ note: record.note, noteIndex: record.note_index, baseFrequency: baseline,
    stretchTable, modelReferenceHz: b.get(0x1b34),
    registryPitchScale: cfg.registry_constants.pitch_scale, registryReferenceNote: cfg.registry_constants.reference_note }, math);
  prepared.set(key, { baseline, stretch });
}
const anchorSource = prepared.get('69:69');
const low = cfg.tuning_integers['0xe8'], high = cfg.tuning_integers['0x100'];
if (!Number.isInteger(low) || !Number.isInteger(high) || low < 0 || high > 127 || high < low || prepared.size !== high - low + 1)
  throw new Error('Incomplete tuning note range');
for (const data of [final, stretched]) {
  if (data.records.length % prepared.size) throw new Error('Incomplete tuning traversal');
  for (const [i, row] of data.records.entries())
    if (row.note_index !== low + i % prepared.size || row.note !== row.note_index) throw new Error('Incomplete or unordered tuning traversal');
}
if (!anchorSource || !same(anchorSource.stretch.frequency, observedAnchor.anchor_frequency))
  throw new Error('Calculated pre-anchor frequency differs from actual anchor input');
const scale = anchorFrequencyScale(tuning.midi.float, anchorSource.stretch.frequency, observedAnchor.registry_multiplier);
const checks = [], failures = [];
let floatValues = 0, floatMismatches = 0;
function check(key, name, prediction, actual) {
  floatValues++;
  const bitEqual = same(prediction, actual);
  floatMismatches += !bitEqual;
  const result = { key, name, prediction, actual, bitEqual };
  if (!bitEqual) failures.push(result);
  checks.push(result);
}
for (const record of final.records) {
  const key = `${record.note_index}:${record.note}`, prediction = prepared.get(key);
  const output = finishTuning({ note: record.note, baseFrequency: prediction.baseline,
    stretchedFrequency: prediction.stretch.frequency, anchorScale: scale, modelReferenceHz: b.get(0x1b34),
    pitchCurve, runtimeCurveMode: { flags: observedCurve.log_x, special: observedCurve.special_mode, dimension: observedCurve.dimension },
    ageing: cfg.tuning_controls['0x280'] }, math);
  for (const [name, value] of Object.entries({ '0x58': output.baseline, '0x5c': output.anchored,
    '0x60': output.referenceRatio, '0x78': output.frequency, '0x80': prediction.stretch.factor }))
    check(key, name, value, record.G_controls[name]);
  prediction.initialRatio = output.initialRatio;
  prediction.output = output;
}
const stretchedKeys = new Set();
for (const record of stretched.records) {
  const key = `${record.note_index}:${record.note}`, prediction = prepared.get(key);
  if (!prediction) throw new Error('Unexpected stretched source note');
  stretchedKeys.add(key);
  check(key, 'pre-anchor-frequency', prediction.stretch.frequency, record.G_controls['0x5c']);
  check(key, 'stretch-factor', prediction.stretch.factor, record.G_controls['0x80']);
  check(key, 'initial-reference-ratio', prediction.initialRatio, record.G_controls['0x60']);
}
if (stretchedKeys.size !== prepared.size) throw new Error('Stretched capture has missing notes');
const result = { schema: 'pianoteq-source-tuning-pass17', uniqueNotes: prepared.size, finalRecords: final.records.length, stretchedRecords: stretched.records.length,
  floatValues, floatMismatches, calculatedAnchorScale: scale, anchorInputVerified: true,
  archivePitchCurveVerified: true, stretchTableProducerReconstructed: false, stretchTableComputedFromSystem,
  stretchRhsStillCaptured, nativeMathOracleRequired: true,
  predictedSources: [...prepared].map(([key, value]) => ({ key, frequency: value.output.frequency })),
  nativeUniqueRequests: nativeCalls.size, checks, oracleCalls: [...nativeCalls.values()], failures, passed: failures.length === 0 };
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, checks: undefined, predictedSources: undefined, oracleCalls: undefined }, null, 2));
if (!result.passed) process.exitCode = 1;
