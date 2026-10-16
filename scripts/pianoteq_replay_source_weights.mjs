// Usage: node SCRIPT preweights-runtime source-runtime base-models constants-runtime [report]
import fs from 'node:fs';
import { sourceWeights } from '../dsp/source-weights.mjs';
const [beforePath, afterPath, archivePath, constantsPath, reportPath] = process.argv.slice(2);
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const before = read(beforePath), after = read(afterPath), constants = read(constantsPath);
const banks = read(archivePath);
if ([before, after, constants].some(d => d.errors.length || !d.records.length)) throw new Error('Incomplete capture');
const offset = constants.records[0].weight_offset;
if (!constants.records.every(r => r.weight_offset === offset)) throw new Error('Nonconstant weight offset');
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
const same = (a, b) => a.length === b.length && a.every((v, i) => bits(v) === bits(b[i]));
const checks = [], failures = [];
for (const row of before.records) {
  const matchingBanks = banks.filter(bank => {
    const fields = new Map(bank.fields.map(f => [f.object_offset, f.value]));
    return same(fields.get(0x1c28)?.[row.note_index - 1] ?? [], row.weights) &&
           same(fields.get(0x1c40)?.[row.note_index - 1] ?? [], row.coordinates);
  });
  if (matchingBanks.length !== 1) throw new Error('Archive row identity must match uniquely');
  const predicted = sourceWeights({ ...row, weightOffset: offset }, { log: Math.log, exp: Math.exp });
  const outputs = after.records.filter(r => r.note === row.note && r.note_index === row.note_index);
  if (!outputs.length) throw new Error('No aligned output records');
  for (const output of outputs) {
    const actual = output.G_vectors['0x6f0'];
    if (actual.length !== predicted.output.length) throw new Error('Incomplete output vector');
    const mismatches = actual.flatMap((v, i) => bits(v) === bits(predicted.output[i]) ? [] :
      [{ index: i, actual: v, calculated: predicted.output[i] }]);
    failures.push(...mismatches);
    checks.push({ note: row.note, mode: output.mode, values: actual.length, mismatches: mismatches.length });
  }
}
const report = { input_records: before.records.length, archive_row_identity_verified: true,
  weight_offset_directly_observed: offset, double_dependencies: 'JavaScript Math.log / Math.exp; tested inputs only',
  checks, failures, passed: failures.length === 0, complete_voice_verified: false };
const text = JSON.stringify(report, null, 2);
if (reportPath) fs.writeFileSync(reportPath, text + '\n');
console.log(text);
process.exitCode = report.passed ? 0 : 1;
