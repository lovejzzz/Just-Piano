// Compare the independent scalar expf reconstruction with authentic observed
// returns, plus optional independently linked host-system oracle samples.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { nativeScalarExp } from '../dsp/native-scalar-exp.mjs';
const args = process.argv.slice(2);
function option(name) { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; }
const capturePath = option('--capture');
if (!capturePath) throw Error('Usage: --capture runtime.json [--oracle executable] [--output report.json]');
const view = new DataView(new ArrayBuffer(4));
function bits(x) { view.setFloat32(0, x); return view.getUint32(0); }
function value(x) { view.setUint32(0, x); return view.getFloat32(0); }
function hex(x) { return x.toString(16).padStart(8, '0'); }
const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
if (capture.schema !== 1 || capture.point !== '0x1006e5584' || !Array.isArray(capture.records) || !capture.records.length || capture.errors?.length)
  throw Error('Empty, failed or unexpected native capture');
const failures = [];
const actual = capture.records.map((r, i) => {
  const input = Math.fround(-r.controls['0x25c'] * r.time);
  if (![input, r.exponential].every(Number.isFinite)) throw Error(`Bad record ${i}`);
  const predicted = nativeScalarExp(input);
  const equal = bits(predicted) === bits(r.exponential);
  if (!equal) failures.push({ kind: 'capture', i, input, predicted, observed: r.exponential });
  return { i, input, predicted, observed: r.exponential, equal };
});
let oracle = null;
const oraclePath = option('--oracle');
if (oraclePath) {
  const samples = new Set(actual.map(r => bits(r.input)));
  // Native branch boundaries, float underflow/overflow boundaries, +/-0,
  // infinities, subnormals, and NaNs are independent of the application capture.
  for (const center of [0, 0x80000000, 0x00800000, 0x80800000, 0x42b17218, 0xc2cff1b5, 0xc2aeac50, 0x43000000, 0xc3000000, 0x7f800000, 0xff800000, 0x7fc00000]) {
    for (let delta = -16; delta <= 16; delta++) samples.add((center + delta) >>> 0);
  }
  // Three adjacent binary32 values around range-reduction half-integer ties.
  for (let n = -20000; n <= 20000; n += 3) {
    const u = bits((n + 0.5) / 184.6649652337873);
    for (let d = -1; d <= 1; d++) samples.add((u + d) >>> 0);
  }
  // Deterministic raw-word sampling covers the entire float32 exponent space.
  let seed = 0x31415926;
  for (let i = 0; i < 20000; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    samples.add(seed >>> 0);
  }
  const words = [...samples];
  const result = spawnSync(oraclePath, [], { input: words.map(hex).join('\n') + '\n', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw result.error || Error(result.stderr || 'Oracle failed');
  const outputWords = result.stdout.trim().split(/\s+/);
  if (!outputWords.every(word => /^[0-9a-f]{8}$/.test(word))) throw Error('Malformed hardware oracle output');
  const observed = outputWords.map(x => parseInt(x, 16));
  if (observed.length !== words.length) throw Error('Oracle result count differs');
  let mismatchCount = 0, nanCount = 0;
  for (let i = 0; i < words.length; i++) {
    const input = value(words[i]);
    const predicted = nativeScalarExp(input);
    const expected = value(observed[i]);
    // JS NaN payload propagation is implementation-defined. Compare NaN class.
    const equal = Number.isNaN(expected) ? Number.isNaN(predicted) : bits(predicted) === observed[i];
    if (Number.isNaN(expected)) nanCount++;
    if (!equal) {
      mismatchCount++;
      if (failures.length < 30) failures.push({ kind: 'oracle', inputBits: hex(words[i]), expectedBits: hex(observed[i]), predictedBits: hex(bits(predicted)) });
    }
  }
  oracle = { samples: words.length, mismatchCount, nanClassComparisons: nanCount, equal: mismatchCount === 0 };
}
const report = {
  schema: 'pianoteq-native-scalar-exp-pass21',
  implementation: 'macOS arm64 scalar libsystem_m expf binary64 FMA/table reconstruction',
  capture: { records: actual.length, equal: actual.every(r => r.equal), comparisons: actual },
  oracle,
  equal: failures.length === 0 && (!oracle || oracle.equal),
  failures,
  limitations: ['Matches the inspected macOS arm64 system algorithm; other libm versions may differ.', 'NaN classification is checked; payload bits and floating exception flags are outside this JS contract.', 'This verifies scalar expf, not full piano audio.'],
};
if (option('--output')) fs.writeFileSync(option('--output'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ equal: report.equal, captureRecords: actual.length, oracle, failures }, null, 2));
if (!report.equal) process.exitCode = 1;
