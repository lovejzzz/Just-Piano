// node SCRIPT counts.json raw.json filter.json weights.json table.json oracle report.json
//   [--source-controls-report computed-source-controls.json]
//   [--archives base-models.json decoded-preset.json]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { archiveStretchControls, stretchIntervalRatio, stretchPartialLimit, stretchPartialCounts, stretchRawConstraints, stretchConstraintRhs } from '../dsp/stretch-rhs.mjs';
import { stretchSines, buildStretchMatrix, stretchTableFromLogSolution } from '../dsp/stretch-system.mjs';
import { stretchLuFactor, stretchLuSolve } from '../dsp/stretch-linear.mjs';
const [countsPath, rawPath, filterPath, weightsPath, tablePath, oracle, reportPath, ...options] = process.argv.slice(2);
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
function capture(path, schema, stage, point) {
  const data = read(path);
  if (data.schema !== schema || data.stage !== stage || data.point !== point || data.errors.length || data.records.length !== 1)
    throw new Error(`Incomplete ${stage} capture`);
  return data.records[0];
}
const counts = capture(countsPath, 1, 'counts', '0x100327188');
const raw = capture(rawPath, 1, 'raw', '0x100327de0');
const filter = capture(filterPath, 1, 'filter', '0x10089755c');
const weights = capture(weightsPath, 2, 'weights', '0x100327388');
const table = capture(tablePath, 2, 'table', '0x1003283d8');
let stiffness = counts.stiffness_table, stiffnessComputedFromArchive = false, archiveControls = null;
for (let i = 0; i < options.length; i++) {
  if (options[i] === '--archives') {
    const base = read(options[++i])[0], preset = read(options[++i]);
    archiveControls = archiveStretchControls(base.fields, preset.decoded_tail.fields,
      { flags: counts.weight_curve.log_x, special: counts.weight_curve.special_mode, dimension: counts.weight_curve.dimension });
    continue;
  }
  if (options[i] !== '--source-controls-report') throw new Error('Expected --source-controls-report or --archives');
  const report = read(options[++i]);
  if (report.schema !== 'pianoteq-source-controls-pass17' || report.passed !== true || report.nativeDoubleValues !== 128 ||
      report.nativeDoubleMismatches !== 0 || report.nativeIntermediateStiffnessDoubleVerified !== true ||
      report.archiveCurvesVerified !== true || report.stiffnessTable?.length !== 128 ||
      !report.stiffnessTable.every((x, i) => x.note === i && Number.isFinite(x.stiffnessDouble)))
    throw new Error('Verified archive stiffness table required');
  stiffness = report.stiffnessTable.map(x => x.stiffnessDouble);
  stiffnessComputedFromArchive = true;
}
const word = new DataView(new ArrayBuffer(8));
const bits = x => { word.setFloat64(0, x); return word.getBigUint64(0).toString(16).padStart(16, '0'); };
const decode = x => { word.setBigUint64(0, BigInt(`0x${x}`)); return word.getFloat64(0); };
const calls = new Map();
const math = Object.fromEntries(['sin', 'exp2', 'log2', 'pow', 'sincos'].map(name => [name, (...args) => {
  const inputs = args.map(bits), key = `${name}:${inputs.join(':')}`;
  if (!calls.has(key)) {
    const result = spawnSync(oracle, [name, ...inputs], { encoding: 'utf8' });
    const pattern = name === 'sincos' ? /^[0-9a-f]{16} [0-9a-f]{16}\s*$/ : /^[0-9a-f]{16}\s*$/;
    if (result.status !== 0 || !pattern.test(result.stdout)) throw new Error('Independent system math oracle failed');
    calls.set(key, { name, inputs, output: result.stdout.trim() });
  }
  const output = calls.get(key).output.split(' ');
  return name === 'sincos' ? { sin: decode(output[0]), cos: decode(output[1]) } : decode(output[0]);
}]));
const checks = [], failures = [];
function compare(name, prediction, actual, float = false) {
  if (prediction.length !== actual.length || !Array.from(actual).every(Number.isFinite)) throw new Error(`Incomplete ${name}`);
  let mismatches = 0;
  for (let i = 0; i < prediction.length; i++) {
    const p = float ? Math.fround(prediction[i]) : prediction[i], a = float ? Math.fround(actual[i]) : actual[i];
    if (bits(p) !== bits(a)) {
      mismatches++;
      if (failures.length < 30) failures.push({ name, index: i, predicted: p, actual: a, predictedBits: bits(p), actualBits: bits(a) });
    }
  }
  checks.push({ name, count: prediction.length, mismatches, bitExact: mismatches === 0 });
}
if ([raw.interval, weights.interval, table.interval].some(x => x !== counts.interval) ||
    JSON.stringify(raw.controls) !== JSON.stringify(counts.controls) ||
    JSON.stringify(table.tuning_controls) !== JSON.stringify(counts.controls) || filter.extend !== 1 ||
    filter.smoothing !== counts.controls['0xb8']) throw new Error('Capture configurations differ');
const controls = archiveControls ?? { interval: counts.interval, referenceHz: counts.controls['0x20'],
  stretch: counts.controls['0x38'], smoothing: counts.controls['0xb8'], weightCurve: counts.weight_curve };
compare('archive-controls', [controls.interval, controls.referenceHz, controls.stretch, controls.smoothing],
  [counts.interval, counts.controls['0x20'], counts.controls['0x38'], counts.controls['0xb8']]);
for (const axis of ['x', 'y']) compare(`archive-weight-curve-${axis}`, controls.weightCurve[axis], counts.weight_curve[axis], true);
compare('stiffness-counts', stiffness, counts.stiffness_table);
compare('stiffness-raw', stiffness, raw.stiffness_table);
compare('stiffness-table', stiffness, table.stiffness_table);
const rational = stretchIntervalRatio(controls.interval, math), partialLimit = stretchPartialLimit(rational);
compare('rational-and-limit', [rational.ratio, rational.numerator, rational.denominator, partialLimit],
  [counts.interval_ratio, counts.rational_numerator, counts.rational_denominator, counts.partial_limit]);
const partials = stretchPartialCounts(controls.weightCurve, rational);
compare('partials', partials, counts.partials);
const constraints = stretchRawConstraints({ interval: controls.interval, ratio: rational.ratio, partials,
  stiffnessTable: stiffness, stretch: controls.stretch }, math);
compare('scaled-low-stiffness', constraints.scaledLow, raw.scaled_low);
compare('scaled-high-stiffness', constraints.scaledHigh, raw.scaled_high);
compare('raw-log-constraints', constraints.raw, raw.raw, true);
compare('raw-copy', constraints.raw, raw.normalized, true);
const prepared = stretchConstraintRhs({ interval: controls.interval, raw: constraints.raw,
  referenceHz: controls.referenceHz, smoothing: controls.smoothing }, math);
if (!prepared.filtered) throw new Error('Expected active smoothing branch');
compare('normalized-filter-input', prepared.normalized, filter.input, true);
compare('filter-coefficients', prepared.filtered.coefficients, filter.coefficients, true);
compare('filter-delay', [prepared.filtered.delay], [filter.delay]);
compare('filtered-constraints', prepared.filtered.values, filter.output, true);
compare('complete-rhs', prepared.rhs, table.rhs);
const sines = stretchSines(math);
compare('sines', sines, weights.sines);
const matrix = buildStretchMatrix({ interval: controls.interval, sines, middleWeight: weights.middle_weight, gramScale: weights.gram_scale });
compare('matrix', matrix.values, table.matrix.values);
const solution = stretchLuSolve(stretchLuFactor(matrix), prepared.rhs);
compare('solution', solution, table.solution);
const predictedTable = stretchTableFromLogSolution(solution, math);
compare('frequency-table', predictedTable, table.table, true);
const result = { schema: 'pianoteq-stretch-rhs-pass19', passed: checks.every(x => x.bitExact), checks, failures,
  stiffnessComputedFromArchive, stiffnessStillCaptured: !stiffnessComputedFromArchive,
  rhsStillCaptured: false, registryWeightsStillCaptured: true, tuningControlsComputedFromArchive: Boolean(archiveControls),
  tuningControlsAndCurveStillCaptured: !archiveControls, runtimeCurveModesStillCaptured: true,
  nativeMathOracleRequired: true, browserAudioFidelityVerified: false,
  predictedRhs: Array.from(prepared.rhs), predictedTable: Array.from(predictedTable), oracleCalls: [...calls.values()] };
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, predictedRhs: undefined, predictedTable: undefined, oracleCalls: undefined }, null, 2));
if (!result.passed) process.exitCode = 1;
