// Usage: node SCRIPT before-runtime.json after-runtime.json [report.json]
import fs from 'node:fs';
import { normalizeSourceAmplitudes } from '../dsp/modal-source.mjs';
const [beforePath, afterPath, reportPath] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(beforePath)), after = JSON.parse(fs.readFileSync(afterPath));
if ([before, after].some(d => d.errors.length || !d.records.length)) throw new Error('Incomplete capture');
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
const checks = [], failures = [];
for (const row of before.records) {
  const matches = after.records.filter(r => r.note_index === row.note_index && r.mode === row.mode);
  if (matches.length !== 1) throw new Error('Unique normalized output required');
  const output = matches[0];
  for (const key of ['0x10', '0x38', '0x88']) {
    const a = row.matrices[key], b = output.matrices[key];
    if (a.rows !== b.rows || a.cols !== b.cols || a.values.length !== b.values.length ||
        a.values.some((v, i) => bits(v) !== bits(b.values[i]))) throw new Error('Unchanged tables must align completely');
  }
  const prediction = normalizeSourceAmplitudes(row.matrices['0x60'].values);
  const actual = output.matrices['0x60'].values;
  if (prediction.values.length !== actual.length) throw new Error('Amplitude shape differs');
  for (let i = 0; i < actual.length; i++) if (bits(prediction.values[i]) !== bits(actual[i]))
    failures.push({ mode: row.mode, index: i, predicted: prediction.values[i], actual: actual[i] });
  checks.push({ noteIndex: row.note_index, mode: row.mode, amplitudeValues: actual.length,
    maximumBefore: prediction.maximum, scale: prediction.scale });
}
const report = { checks, failures, passed: failures.length === 0, completeVoiceVerified: false };
const text = JSON.stringify(report, null, 2);
if (reportPath) fs.writeFileSync(reportPath, text + '\n');
console.log(text);
process.exitCode = report.passed ? 0 : 1;
