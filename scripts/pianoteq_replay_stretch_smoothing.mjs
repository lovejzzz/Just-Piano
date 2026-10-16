// Usage: node SCRIPT filter-runtime.json native-math-oracle [report.json]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { stretchSmooth } from '../dsp/stretch-smoothing.mjs';
const [capturePath, oraclePath, reportPath] = process.argv.slice(2);
if (!oraclePath || process.argv.length > 5) throw new Error('Expected filter capture, native math oracle, optional report');
const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
if (capture.schema !== 1 || capture.stage !== 'filter' || capture.errors?.length || !capture.records?.length)
  throw new Error('Expected authentic schema1 filter capture');
const view = new DataView(new ArrayBuffer(8));
const bits64 = value => { view.setFloat64(0, value); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
const from64 = word => { view.setBigUint64(0, BigInt(`0x${word}`)); return view.getFloat64(0); };
const bits32 = value => { view.setFloat32(0, value); return view.getUint32(0).toString(16).padStart(8, '0'); };
const calls = new Map();
const math = { sincos: angle => {
  const inputBits = bits64(angle);
  if (!calls.has(inputBits)) {
    const raw = spawnSync(oraclePath, ['sincos', inputBits], { encoding: 'utf8' });
    const words = raw.stdout.trim().split(/\s+/);
    if (raw.status !== 0 || words.length !== 2 || words.some(word => !/^[0-9a-f]{16}$/.test(word)))
      throw new Error(`Independent native sincos oracle failed: ${raw.stderr}`);
    calls.set(inputBits, { angle, inputBits, outputBits: words, sin: from64(words[0]), cos: from64(words[1]) });
  }
  return calls.get(inputBits);
} };
const checks = [], failures = [], totals = { float32: 0, float64: 0, integer: 0 };
function compare(record, name, expected, actual, precision) {
  if (expected.length !== actual.length) throw new Error(`Shape mismatch ${name}`);
  const bits = precision === 'float32' ? bits32 : precision === 'float64' ? bits64 : value => value;
  for (let index = 0; index < expected.length; index++) {
    totals[precision]++;
    if (bits(expected[index]) !== bits(actual[index])) failures.push({ record, name, index,
      predicted: expected[index], actual: actual[index], predictedBits: bits(expected[index]), actualBits: bits(actual[index]) });
  }
}
for (const [index, record] of capture.records.entries()) {
  if (!record.input?.length || record.input.length !== record.output?.length || record.coefficients?.length !== 5 ||
      record.numerator?.length !== 3 || record.denominator?.length !== 3 || !Number.isInteger(record.delay) ||
      !Number.isInteger(record.extend)) throw new Error('Incomplete filter capture');
  const result = stretchSmooth(record.input, record.smoothing, Boolean(record.extend & 1), math);
  compare(index, 'clamped-smoothing', [result.smoothing], [record.smoothing], 'float32');
  compare(index, 'numerator', result.numerator, record.numerator, 'float64');
  compare(index, 'denominator', result.denominator, record.denominator, 'float64');
  compare(index, 'recurrence-coefficients', result.coefficients, record.coefficients, 'float32');
  compare(index, 'delay', [result.delay], [record.delay], 'integer');
  compare(index, 'filtered-output', result.values, record.output, 'float32');
  checks.push({ record: index, inputLength: record.input.length, ...result, values: Array.from(result.values) });
}
const report = { schema: 'pianoteq-stretch-smoothing-pass19', capturedInputStillRequired: true,
  nativeSincosOracleRequired: true, records: checks.length, totals, mismatchCount: failures.length,
  checks, failures, oracleCalls: Array.from(calls.values()), passed: failures.length === 0 };
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
