// Replay actual LLDB pass9 snapshots through the JavaScript modal kernel.
// Usage: node SCRIPT runtime.json [report.json]
import fs from 'node:fs';
import { renderSixteen } from '../dsp/modal-kernel.mjs';

const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!data.records.length || data.errors.length) throw new Error('Incomplete capture');
const word = new DataView(new ArrayBuffer(4));
function bits(value) {
  word.setFloat32(0, value, true);
  return word.getUint32(0, true);
}
function differences(actual, predicted) {
  if (actual.length !== predicted.length) throw new Error('Array length changed');
  let mismatches = 0;
  for (let i = 0; i < actual.length; i++) {
    if (bits(actual[i]) !== bits(predicted[i])) mismatches++;
  }
  return mismatches;
}

const previous = new Map();
const checks = [];
for (const record of data.records) {
  const key = `${record.thread}:${record.sp}:${record.output_pointer}`;
  const prior = previous.get(key);
  const consecutive = prior &&
    record.P_pointer === prior.P_pointer + 64 &&
    record.Q_pointer === prior.Q_pointer + 64 &&
    record.coefficient_pointer === prior.coefficient_pointer + 128 &&
    record.remaining_groups_x11 === prior.remaining_groups_x11 - 4;
  const output = consecutive
    ? Float32Array.from(prior.output_after)
    : new Float32Array(record.output_after.length);
  const P = Float32Array.from(record.P_before);
  const Q = Float32Array.from(record.Q_before);
  const A = new Float32Array(16);
  const B = new Float32Array(16);
  for (let group = 0; group < 4; group++) {
    for (let lane = 0; lane < 4; lane++) {
      A[group * 4 + lane] = record.coefficients_interleaved[group * 8 + lane];
      B[group * 4 + lane] = record.coefficients_interleaved[group * 8 + 4 + lane];
    }
  }
  renderSixteen(P, Q, A, B, output);
  checks.push({ state_mismatches: differences(record.P_after, P) + differences(record.Q_after, Q),
                output_mismatches: differences(record.output_after, output),
                output_samples: output.length, continued_group: Boolean(consecutive) });
  previous.set(key, record);
}
const result = {
  records: checks.length,
  state_components: checks.length * 32,
  state_bit_mismatches: checks.reduce((n, r) => n + r.state_mismatches, 0),
  output_samples: checks.reduce((n, r) => n + r.output_samples, 0),
  output_bit_mismatches: checks.reduce((n, r) => n + r.output_mismatches, 0),
  checks,
};
result.passed = result.state_bit_mismatches === 0 && result.output_bit_mismatches === 0;
const text = JSON.stringify(result, null, 2);
if (process.argv[3]) fs.writeFileSync(process.argv[3], text);
console.log(JSON.stringify({ ...result, checks: undefined }, null, 2));
process.exitCode = result.passed ? 0 : 1;
