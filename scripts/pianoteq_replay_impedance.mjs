// Usage: node SCRIPT before.json after.json radius.json native-math-oracle [report.json] [--additional-return after2.json]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { modalImpedance, couplingJitterFactors } from '../dsp/modal-impedance.mjs';
import { impedanceControls } from '../dsp/impedance-controls.mjs';
const argumentsOnly = [], additionalReturnPaths = [];
let sourcePolesPath, sourceControlsPath, baseModelsPath, presetPath, baseModelIndex = 0;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--additional-return') {
    if (!process.argv[i + 1]) throw new Error('Missing additional return capture path');
    additionalReturnPaths.push(process.argv[++i]);
  } else if (process.argv[i] === '--source-poles') sourcePolesPath = process.argv[++i];
  else if (process.argv[i] === '--source-controls') sourceControlsPath = process.argv[++i];
  else if (process.argv[i] === '--base-models') baseModelsPath = process.argv[++i];
  else if (process.argv[i] === '--preset') presetPath = process.argv[++i];
  else if (process.argv[i] === '--base-index') baseModelIndex = Number(process.argv[++i]);
  else argumentsOnly.push(process.argv[i]);
}
const [beforePath, afterPath, radiusPath, oracle, reportPath] = argumentsOnly;
if (![beforePath, afterPath, radiusPath, oracle].every(Boolean)) throw new Error('Expected three authentic captures and independent host-math oracle');
const before = JSON.parse(fs.readFileSync(beforePath)), after = JSON.parse(fs.readFileSync(afterPath));
const radius = JSON.parse(fs.readFileSync(radiusPath));
const returnCaptures = [after, ...additionalReturnPaths.map(file => JSON.parse(fs.readFileSync(file)))];
for (const data of [before, ...returnCaptures, radius])
  if (!data.records.length || data.errors.length) throw new Error('Incomplete runtime capture');
if (new Set(radius.records.map(row => row.radius)).size !== 1) throw new Error('Radius values require call-context matching');
const polarRadius = radius.records[0].radius;
let baseModel, preset;
if (baseModelsPath || presetPath) {
  if (!baseModelsPath || !presetPath) throw new Error('Archive input requires both --base-models and --preset');
  baseModel = JSON.parse(fs.readFileSync(baseModelsPath))[baseModelIndex];
  preset = JSON.parse(fs.readFileSync(presetPath));
  if (!baseModel || !preset.decoded_tail?.fields) throw new Error('Missing selected base or decoded preset fields');
}
const archivePrepared = new Map();
const view = new DataView(new ArrayBuffer(8));
function bits(value) { view.setFloat64(0, value); return view.getBigUint64(0).toString(16).padStart(16, '0'); }
function decode(value) { view.setBigUint64(0, BigInt('0x' + value)); return view.getFloat64(0); }
const cache = new Map(), oracleCalls = [];
const math = Object.fromEntries(['log2f', 'exp', 'sincos', 'tan', 'pow', 'log'].map(name => [name, (...values) => {
  const inputs = values.map(bits), key = [name, ...inputs].join(':');
  if (!cache.has(key)) {
    const run = spawnSync(oracle, [name, ...inputs], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`Host math oracle failed: ${run.stderr}`);
    const outputs = run.stdout.trim().split(/\s+/);
    if (outputs.length !== (name === 'sincos' ? 2 : 1) || outputs.some(word => !/^[0-9a-f]{16}$/.test(word)))
      throw new Error('Malformed oracle double-bit output');
    const decoded = outputs.map(decode);
    cache.set(key, name === 'sincos' ? { sin: decoded[0], cos: decoded[1] } : decoded[0]);
    oracleCalls.push({ operation: name, inputs, outputs });
  }
  return cache.get(key);
}]));
const approximateMath = { log2f: x => Math.fround(Math.log2(x)), exp: Math.exp,
  sincos: x => ({ sin: Math.sin(x), cos: Math.cos(x) }), tan: Math.tan, pow: Math.pow, log: Math.log };
const key = record => `${record.note_index}:${record.cache_mode}:${record.modal_coordinate}`;
const returned = new Map();
const checks = [], failures = [];
let commonReturnKeys = 0, commonReturnBitMismatches = 0;
for (const capture of returnCaptures) for (const row of capture.records) {
  if (returned.has(key(row))) {
    commonReturnKeys++;
    const previous = returned.get(key(row));
    const mismatchCount = ['p', 'q'].filter(name => bits(previous[name]) !== bits(row[name])).length;
    commonReturnBitMismatches += mismatchCount;
    if (mismatchCount) failures.push({ stage: 'different-returns-across-captures', key: key(row), previous, actual: row });
  } else returned.set(key(row), row);
}
let outputValues = 0, bitMismatches = 0, approximateBitMismatches = 0, staticRadiusBitMismatches = 0;
for (const [recordIndex, record] of before.records.entries()) {
  const actual = returned.get(key(record));
  if (!actual) { failures.push({ stage: 'missing-return', recordIndex, key: key(record) }); continue; }
  const curve = record.phase_curve;
  if (curve.x.length > 1 && record.inputs.s2 >= curve.x.at(-1))
    throw new Error('Captured phase grid upper end must cover this input without assuming an uncaptured endpoint');
  let sourceControls = record.controls, phaseCurve = curve, bandFrequencies = record.band_frequencies, bandGains = record.band_gains;
  if (baseModel) {
    if (curve.log_x !== 0 || curve.special_mode !== 0) throw new Error('Archive input branch needs observed ordinary linear runtime curve mode');
    const archiveKey = `${record.note_index}:${record.cache_mode}`;
    if (!archivePrepared.has(archiveKey)) archivePrepared.set(archiveKey, impedanceControls({ baseFields: baseModel.fields,
      presetFields: preset.decoded_tail.fields, note: record.note_index, mode: record.cache_mode, runtimeCurveMode: 'linear-clamp' }));
    const source = archivePrepared.get(archiveKey);
    for (const [name, value] of Object.entries(source.controls)) {
      if (bits(Math.fround(value)) !== bits(Math.fround(record.controls[name])))
        failures.push({ stage: 'archive-control-binding', key: key(record), name, prediction: value, actual: record.controls[name] });
    }
    for (const [name, prediction, actual] of [['phase-x', source.phaseCurve.x, curve.x], ['phase-y', source.phaseCurve.y, curve.y],
      ['band-frequency', source.bandFrequencies, record.band_frequencies], ['band-gain', source.bandGains, record.band_gains]]) {
      if (prediction.length !== actual.length || prediction.some((value, j) => bits(Math.fround(value)) !== bits(Math.fround(actual[j]))))
        failures.push({ stage: 'archive-vector-binding', key: key(record), name });
    }
    sourceControls = source.controls; phaseCurve = { ...source.phaseCurve, log_x: curve.log_x, special_mode: curve.special_mode, dimension: curve.dimension };
    bandFrequencies = source.bandFrequencies; bandGains = source.bandGains;
  }
  const input = {
    fundamental: record.inputs.s0, reference: record.inputs.s1, frequency: record.inputs.s2, extraDb: record.inputs.s3,
    strength: sourceControls['0x20'], minimumReference: sourceControls['0x38'], tilt: sourceControls['0x50'],
    mixture: sourceControls['0xc8'], phaseCurve: { ...phaseCurve, flags: phaseCurve.log_x, special: phaseCurve.special_mode },
    bandFrequencies, bandDb: bandGains, polarRadius,
  };
  const prediction = modalImpedance(input, math);
  const approximate = modalImpedance(input, approximateMath);
  const staticRadiusControl = modalImpedance({ ...input, polarRadius: Math.fround(0.1) }, math);
  const errors = ['p', 'q'].map(name => {
    outputValues++;
    const equal = bits(prediction[name]) === bits(actual[name]);
    bitMismatches += !equal;
    approximateBitMismatches += bits(approximate[name]) !== bits(actual[name]);
    staticRadiusBitMismatches += bits(staticRadiusControl[name]) !== bits(actual[name]);
    return { name, predicted: prediction[name], actual: actual[name], predictedBits: bits(prediction[name]),
      actualBits: bits(actual[name]), absoluteError: Math.abs(prediction[name] - actual[name]), bitEqual: equal };
  });
  if (errors.some(row => !row.bitEqual)) failures.push({ stage: 'impedance', recordIndex, key: key(record), errors });
  checks.push({ recordIndex, key: key(record), inputFrequency: input.frequency, errors, arithmetic: prediction });
}
for (const row of returned.values())
  if (!before.records.some(input => key(input) === key(row))) failures.push({ stage: 'missing-input', key: key(row) });
let jitterValues = 0, jitterMismatches = 0;
const jitterChecks = [];
if (sourcePolesPath || sourceControlsPath) {
  if (!sourcePolesPath || !sourceControlsPath) throw new Error('Jitter bridge requires both --source-poles and --source-controls');
  const poles = JSON.parse(fs.readFileSync(sourcePolesPath));
  const controls = JSON.parse(fs.readFileSync(sourceControlsPath));
  for (const data of [poles, controls]) if (!data.records.length || data.errors.length) throw new Error('Incomplete jitter bridge capture');
  for (const check of checks) {
    const record = before.records[check.recordIndex];
    const source = controls.records.filter(row => row.note_index === record.note_index && row.mode === record.cache_mode);
    if (source.length !== 1) throw new Error('Expected unique source controls for jitter');
    const indices = source[0].modal_coordinates.map((value, j) => value === record.modal_coordinate ? j : -1).filter(j => j >= 0);
    if (indices.length !== 1) throw new Error('Expected explicit modal-coordinate row for jitter');
    const factor = couplingJitterFactors(source[0].note, source[0].cache_controls['0x140'], source[0].modal_coordinates.length)[indices[0]];
    const target = poles.records.filter(row => row.note_index === record.note_index && row.cache_mode === record.cache_mode && row.parameters.mode === record.modal_coordinate);
    if (target.length !== 1) throw new Error('Expected unique observed pole coupling parameters');
    const errors = ['p', 'q'].map(name => {
      const prediction = check.arithmetic[name] * factor, actual = target[0].parameters[name];
      const equal = bits(prediction) === bits(actual);
      jitterValues++; jitterMismatches += !equal;
      return { name, prediction, actual, bitEqual: equal };
    });
    jitterChecks.push({ key: check.key, factor, errors });
    if (errors.some(error => !error.bitEqual)) failures.push({ stage: 'deterministic-jitter', key: check.key, errors });
  }
}
const dependencyDifferences = {};
for (const call of oracleCalls) {
  const approximate = approximateMath[call.operation](...call.inputs.map(decode));
  const values = call.operation === 'sincos' ? [approximate.sin, approximate.cos] : [approximate];
  const row = dependencyDifferences[call.operation] ??= { outputs: 0, jsMathBitMismatches: 0 };
  row.outputs += values.length;
  row.jsMathBitMismatches += values.filter((value, j) => bits(value) !== call.outputs[j]).length;
}
const result = {
  inputRecords: before.records.length, returnCaptureCount: returnCaptures.length,
  returnRecords: returnCaptures.reduce((n, data) => n + data.records.length, 0), uniqueReturnRecords: returned.size,
  commonReturnKeys, commonReturnBitMismatches, matchedRecords: checks.length,
  outputValues, bitMismatches, approximateBitMismatches, staticRadiusBitMismatches,
  polarRadius, radiusRecords: radius.records.length,
  controlsAndCurvesComputedFromArchives: Boolean(baseModel), archiveModel: baseModel?.strings?.[0],
  archiveDistinctConfigurations: archivePrepared.size, archiveDistinctControlValues: archivePrepared.size * 4,
  archiveDistinctPhaseValues: [...archivePrepared.values()].reduce((n, source) => n + source.phaseCurve.x.length + source.phaseCurve.y.length, 0),
  platformTranscendentalOracleRequired: true, oracleUniqueCalls: oracleCalls.length,
  jitterValues, jitterMismatches, couplingJitterVerified: jitterValues > 0 && jitterMismatches === 0,
  mathOperations: [...new Set(oracleCalls.map(row => row.operation))], dependencyDifferences,
  checks, jitterChecks, oracleCalls, failures, passed: failures.length === 0,
};
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, checks: undefined, jitterChecks: undefined, oracleCalls: undefined }, null, 2));
if (failures.length) process.exitCode = 1;
