// Usage: node SCRIPT host-oracle [private-evidence-root] [report.json]
// Oracle source: scripts/pianoteq_native_math_oracle.c (macOS Accelerate).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { nativeVectorExp4, nativeVectorExpLane } from '../dsp/native-vector-exp.mjs';
import { nativeScalarLogf } from '../dsp/native-scalar-log.mjs';
const [oracle, evidenceRoot, reportPath] = process.argv.slice(2);
if (!oracle) throw new Error('Expected independent native oracle executable');
const view = new DataView(new ArrayBuffer(4));
function bits(value) { view.setFloat32(0, value); return view.getUint32(0); }
function fromBits(value) { view.setUint32(0, value); return view.getFloat32(0); }
const hex = value => bits(value).toString(16).padStart(8, '0');
const same = (a, b) => Number.isNaN(a) ? Number.isNaN(b) : bits(a) === bits(b);
let seed = 0x721c39a1;
function randomWord() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
const expInputs = [0, -0, Infinity, -Infinity, NaN];
for (const value of [-103.97208404541016, -87.3365478515625, -Math.LN2, Math.LN2, 88.72283935546875]) {
  const center = bits(value);
  for (let delta = -8; delta <= 8; delta++) expInputs.push(fromBits(center + delta));
}
for (let i = 0; i <= 2000; i++) expInputs.push(Math.fround(-104 + i * 193 / 2000));
for (let i = 0; i < 10000; i++) expInputs.push(fromBits(randomWord()));
while (expInputs.length % 4) expInputs.push(0);
const logInputs = [0, -0, Infinity, -Infinity, NaN, -1];
for (const center of [1, 0x007fffff, 0x00800000, 0x3f800000, 0x7f7fffff]) {
  for (let delta = -8; delta <= 8; delta++) if (center + delta > 0) logInputs.push(fromBits(center + delta));
}
// Exercise every lookup rounding boundary at several exponent ranges.
for (const exponent of [1, 64, 126, 127, 128, 200, 254]) {
  for (let j = 0; j < 128; j++) for (const delta of [-1, 0, 1])
    logInputs.push(fromBits((exponent << 23) + (j << 16) + 0x8000 + delta));
}
for (let i = 0; i < 10000; i++) logInputs.push(fromBits(randomWord()));
const commands = [];
for (let i = 0; i < expInputs.length; i += 4) commands.push('exp4 ' + expInputs.slice(i, i + 4).map(hex).join(' '));
for (const value of logInputs) commands.push('log ' + hex(value));
const run = spawnSync(oracle, [], { input: commands.join('\n') + '\n', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (run.status !== 0) throw new Error(`Native oracle failed: ${run.stderr}`);
const outputs = run.stdout.trim().split(/\s+/).map(value => fromBits(Number.parseInt(value, 16)));
if (outputs.length !== expInputs.length + logInputs.length) throw new Error('Oracle output count differs');
const failures = [];
function check(stage, input, actual, expected) {
  if (!same(expected, actual)) failures.push({ stage, input: hex(input), actual: hex(actual), expected: hex(expected) });
}
for (let i = 0; i < expInputs.length; i += 4) {
  const prediction = nativeVectorExp4(expInputs.slice(i, i + 4));
  for (let lane = 0; lane < 4; lane++) check('host-exp4', expInputs[i + lane], prediction[lane], outputs[i + lane]);
}
for (let i = 0; i < logInputs.length; i++) check('host-logf', logInputs[i], nativeScalarLogf(logInputs[i]), outputs[expInputs.length + i]);
const captures = [];
if (evidenceRoot) {
  for (const directory of ['debug-pass10-spectrum-v2', 'debug-pass10-spectrum-forte']) {
    const data = JSON.parse(fs.readFileSync(path.join(evidenceRoot, directory, 'runtime.json')));
    let count = 0, approximateMismatches = 0;
    for (const record of data.records) for (let lane = 0; lane < 4; lane++) {
      if (record.block * 4 + lane >= record.count) continue;
      const input = record.log_before[lane], expected = record.exp_after[lane]; count++;
      check(directory, input, nativeVectorExpLane(input), expected);
      approximateMismatches += !same(Math.fround(Math.exp(input)), expected);
    }
    captures.push({ stage: directory, count, approximateMismatches });
  }
  const directory = 'debug-pass11-coefficients-v3';
  const data = JSON.parse(fs.readFileSync(path.join(evidenceRoot, directory, 'runtime.json')));
  let count = 0, approximateMismatches = 0;
  for (const record of data.records) for (let g = 0; g < record.groups.length; g++) {
    const group = record.lanes.filter(lane => lane.group === g), start = Math.floor(group.length / 8) * 8;
    for (const lane of group.slice(start)) {
      if (!lane.valid) continue;
      const input = Math.fround(-record.controls['0xc'] * lane.effective_decay); count++;
      check(directory, input, nativeVectorExpLane(input), lane.R);
      approximateMismatches += !same(Math.fround(Math.exp(input)), lane.R);
    }
  }
  captures.push({ stage: directory + ':tail-exp', count, approximateMismatches });
  const logs = JSON.parse(fs.readFileSync(path.join(evidenceRoot, directory, 'normalization-logf-comparison.json')));
  for (const row of logs) check(directory + ':logf', row.ratio, nativeScalarLogf(row.ratio), row.c_logf);
  captures.push({ stage: directory + ':logf', count: logs.length,
    approximateMismatches: logs.filter(row => !same(Math.fround(Math.log(row.ratio)), row.c_logf)).length });
}
const result = { hostOracleProvenance: run.stderr.trim(), hostExpLanes: expInputs.length, hostLogValues: logInputs.length,
  captures, failures, passed: failures.length === 0, nanComparison: 'classification; payload not compared' };
const text = JSON.stringify(result, null, 2);
if (reportPath) fs.writeFileSync(reportPath, text + '\n');
console.log(text);
if (failures.length) process.exitCode = 1;
