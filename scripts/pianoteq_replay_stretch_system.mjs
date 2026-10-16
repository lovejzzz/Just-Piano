// node SCRIPT before.json weights.json table.json independent-math-oracle [report.json]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { stretchSines, buildStretchMatrix, stretchTableFromLogSolution } from '../dsp/stretch-system.mjs';
import { stretchLuFactor, stretchLuSolve, stretchMatvec } from '../dsp/stretch-linear.mjs';
const [beforePath, weightsPath, tablePath, oracle, reportPath] = process.argv.slice(2);
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const captures = [read(beforePath), read(weightsPath), read(tablePath)];
for (const [i, data] of captures.entries()) {
  const stage = ['before', 'weights', 'table'][i], point = ['0x1003281c0', '0x100327388', '0x1003283d8'][i];
  if (data.schema !== 2 || data.stage !== stage || data.point !== point || data.errors.length || data.records.length !== 1)
    throw new Error(`Incomplete or unexpected ${stage} capture`);
}
const [before, weights, actual] = captures.map(x => x.records[0]);
if (before.interval !== weights.interval || before.interval !== actual.interval ||
    JSON.stringify(before.rhs) !== JSON.stringify(actual.rhs)) throw new Error('Inconsistent captures');
const word = new DataView(new ArrayBuffer(8));
const bits = x => { word.setFloat64(0, x); return word.getBigUint64(0).toString(16).padStart(16, '0'); };
const decode = x => { word.setBigUint64(0, BigInt(`0x${x}`)); return word.getFloat64(0); };
const requests = new Map();
const math = Object.fromEntries(['sin', 'exp2', 'pow'].map(name => [name, (...args) => {
  const inputs = args.map(bits), key = `${name}:${inputs.join(':')}`;
  if (!requests.has(key)) {
    const result = spawnSync(oracle, [name, ...inputs], { encoding: 'utf8' });
    if (result.status !== 0 || !/^[0-9a-f]{16}\s*$/.test(result.stdout)) throw new Error('System math oracle failed');
    requests.set(key, { name, inputs, output: result.stdout.trim() });
  }
  return decode(requests.get(key).output);
}]));
const checks = [], failures = [];
function compare(name, predicted, observed, float = false) {
  if (predicted.length !== observed.length) throw new Error(`${name} dimensions differ`);
  let mismatches = 0;
  for (let i = 0; i < predicted.length; i++) {
    const p = float ? Math.fround(predicted[i]) : predicted[i], a = float ? Math.fround(observed[i]) : observed[i];
    if (bits(p) !== bits(a)) {
      mismatches++;
      if (failures.length < 30) failures.push({ name, index: i, predicted: p, actual: a, predictedBits: bits(p), actualBits: bits(a) });
    }
  }
  checks.push({ name, count: predicted.length, mismatches, bitExact: mismatches === 0 });
}
const sines = stretchSines(math);
compare('sines', sines, weights.sines);
const matrix = buildStretchMatrix({ interval: before.interval, sines, middleWeight: weights.middle_weight, gramScale: weights.gram_scale });
if (before.matrix.rows !== matrix.rows || before.matrix.columns !== matrix.columns || before.matrix.layout !== matrix.layout ||
    actual.matrix.rows !== matrix.rows || actual.matrix.columns !== matrix.columns || actual.matrix.layout !== matrix.layout)
  throw new Error('Unexpected native matrix shape');
compare('matrix-before', matrix.values, before.matrix.values);
compare('matrix-table', matrix.values, actual.matrix.values);
const factor = stretchLuFactor(matrix), solution = stretchLuSolve(factor, before.rhs);
compare('log-frequency-solution', solution, actual.solution);
compare('matrix-product', stretchMatvec(matrix, solution), actual.product);
const table = stretchTableFromLogSolution(solution, math);
compare('frequency-table', table, actual.table, true);
const result = { schema: 'pianoteq-stretch-system-pass18', passed: checks.every(x => x.bitExact), checks, failures,
  interval: before.interval, middleWeight: weights.middle_weight, gramScale: weights.gram_scale,
  stiffnessRhsProducerReconstructed: false, rhsStillCaptured: true, registryWeightsStillCaptured: true,
  nativeMathOracleRequired: true, browserAudioFidelityVerified: false,
  predictedTable: Array.from(table), oracleCalls: [...requests.values()] };
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, predictedTable: undefined, oracleCalls: undefined }, null, 2));
if (!result.passed) process.exitCode = 1;
