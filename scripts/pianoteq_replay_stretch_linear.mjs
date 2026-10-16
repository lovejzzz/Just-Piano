// Usage: node SCRIPT before-schema2.json lu-schema2.json [report.json]
//   [--after after-or-table-schema2.json]
import fs from 'node:fs';
import { stretchLuFactor, stretchLuSolve, stretchMatvec } from '../dsp/stretch-linear.mjs';
const positional = []; let afterPath;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--after') afterPath = process.argv[++i];
  else if (process.argv[i].startsWith('--')) throw new Error(`Unknown argument ${process.argv[i]}`);
  else positional.push(process.argv[i]);
}
const [beforePath, luPath, reportPath] = positional;
if (!luPath || positional.length > 3) throw new Error('Expected before capture, LU capture, optional report');
const read = (path, stage) => {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const stages = Array.isArray(stage) ? stage : [stage];
  if (data.schema !== 2 || !stages.includes(data.stage) || data.errors?.length || data.records?.length !== 1)
    throw new Error(`Expected one complete schema2 ${stage} record`);
  return data.records[0];
};
const before = read(beforePath, 'before'), actual = read(luPath, 'lu'), after = afterPath ? read(afterPath, ['after', 'table']) : null;
const n = before.matrix.rows;
if (before.matrix.columns !== n || n !== 215 - before.interval || before.rhs.length !== n || before.solution.length !== n ||
    actual.lu.rows !== n || actual.lu.columns !== n || actual.pivots.length !== n || actual.rhs.length !== n || actual.solution.length !== n)
  throw new Error('Stretch system dimensions differ');
const view = new DataView(new ArrayBuffer(8));
const bits = value => { view.setFloat64(0, value); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
const failures = [], comparisons = [];
function compare(name, predicted, expected, integer = false) {
  if (predicted.length !== expected.length) throw new Error(`Shape differs: ${name}`);
  let mismatches = 0;
  for (let j = 0; j < expected.length; j++) {
    if (integer ? predicted[j] !== expected[j] : bits(predicted[j]) !== bits(expected[j])) {
      mismatches++;
      failures.push({ name, index: j, predicted: predicted[j], actual: expected[j],
        ...(integer ? {} : { predictedBits: bits(predicted[j]), actualBits: bits(expected[j]) }) });
    }
  }
  comparisons.push({ name, values: expected.length, mismatches, precision: integer ? 'int32' : 'binary64' });
}
compare('before-vs-LU-rhs', before.rhs, actual.rhs);
const factorization = stretchLuFactor(before.matrix);
if (factorization.info !== 0) throw new Error(`Recovered LU returns info=${factorization.info}`);
compare('LU-factors', factorization.lu.values, actual.lu.values);
compare('LU-pivots', factorization.pivots, actual.pivots, true);
const solution = stretchLuSolve(factorization, before.rhs);
compare('LU-solution', solution, actual.solution);
const nativeFactorSolution = stretchLuSolve({ lu: actual.lu, pivots: actual.pivots, info: 0 }, actual.rhs);
compare('solve-from-native-LU', nativeFactorSolution, actual.solution);
const product = stretchMatvec(before.matrix, solution);
if (after) {
  if (after.matrix.rows !== n || after.matrix.columns !== n || after.rhs.length !== n || after.solution.length !== n || after.product.length !== n)
    throw new Error('After snapshot dimensions differ');
  compare('before-vs-after-matrix', before.matrix.values, after.matrix.values);
  compare('before-vs-after-rhs', before.rhs, after.rhs);
  compare('after-solution', solution, after.solution);
  compare('after-matrix-vector-product', product, after.product);
}
const residualL2 = Math.sqrt(Array.from(product, (value, j) => (value - before.rhs[j]) ** 2).reduce((a, b) => a + b, 0));
const report = { schema: 'pianoteq-stretch-linear-pass18', interval: before.interval, dimension: n,
  capturedMatrixAndRhsStillRequired: true, originalMatrixPreserved: true,
  nativeLuFactorizationVerified: comparisons.filter(row => row.name === 'LU-factors' || row.name === 'LU-pivots').every(row => row.mismatches === 0),
  fma64Required: true, afterMatvecVerified: Boolean(after) && comparisons.find(row => row.name === 'after-matrix-vector-product').mismatches === 0,
  factorizationInfo: factorization.info,
  comparisons, mismatchCount: failures.length, residualL2Diagnostic: residualL2,
  // Diagnostic norm is not a replacement for exact native product comparison.
  failures, solution: Array.from(solution), product: Array.from(product), passed: failures.length === 0 };
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, solution: undefined, product: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
