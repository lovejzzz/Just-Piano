// node SCRIPT compiled-oracle [report.json]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { neonReciprocalEstimateNormal, neonReciprocalNormal } from '../dsp/neon-reciprocal.mjs';
const [oracle, reportPath] = process.argv.slice(2);
const words = new Set(), view = new DataView(new ArrayBuffer(4));
for (const exponent of [1, 32, 64, 93, 100, 126, 127, 128, 160, 200, 252]) {
  for (let bucket = 0; bucket < 256; bucket++) for (const tail of [0, 1, 32767]) {
    const word = ((exponent << 23) | (bucket << 15) | tail) >>> 0;
    words.add(word); words.add((word | 0x80000000) >>> 0);
  }
}
const hex = x => x.toString(16).padStart(8, '0');
const inputWords = [...words].map(hex), input = inputWords.join('\n') + '\n';
const run = spawnSync(oracle, [], { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (run.status !== 0) throw new Error(`Hardware oracle failed: ${run.stderr}`);
const lines = run.stdout.trim().split('\n');
if (lines.length !== words.size) throw new Error('Incomplete hardware oracle output');
const failures = [];
const bits = value => { view.setFloat32(0, value); return hex(view.getUint32(0)); };
for (const [i, line] of lines.entries()) {
  if (!/^[0-9a-f]{8} [0-9a-f]{8} [0-9a-f]{8}$/.test(line)) throw new Error('Invalid oracle line');
  const [word, seed, result] = line.split(' ');
  if (word !== inputWords[i]) throw new Error('Oracle order differs');
  view.setUint32(0, parseInt(word, 16));
  const x = view.getFloat32(0);
  const prediction = [bits(neonReciprocalEstimateNormal(x)), bits(neonReciprocalNormal(x))];
  if (prediction[0] !== seed || prediction[1] !== result) failures.push({ input: word, prediction, actual: [seed, result] });
}
const report = { schema: 'pianoteq-neon-reciprocal-pass20', inputValues: words.size,
  comparedValues: words.size * 2, mismatches: failures.length, failures, passed: failures.length === 0,
  inputDomain: 'normal binary32 with exponent field 1..252; 11 exponents and bucket boundaries, both signs',
  specialValuesImplemented: false, increasedPrecisionVariantImplemented: false };
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, failures: failures.slice(0, 10) }, null, 2));
if (!report.passed) process.exitCode = 1;
