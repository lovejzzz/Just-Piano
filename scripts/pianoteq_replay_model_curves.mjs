// Inputs are private local archive extractions, never bundled commercial data.
// Usage: node SCRIPT base-model.json full-fxp.json hardness-capture.json [report.json]
import fs from 'node:fs';
import { archiveHardnessAt69 } from '../dsp/model-curves.mjs';
const [basePath, presetPath, capturePath, reportPath] = process.argv.slice(2);
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const base = read(basePath)[0];
const preset = read(presetPath);
const capture = read(capturePath);
if (base.version !== 89 || capture.errors?.length) throw new Error('Unsupported archive or capture errors');
const calculated = archiveHardnessAt69({ baseFields: base.fields,
  presetFields: preset.decoded_tail.fields, note: 69, runtimeMode: 'linear-clamp' });
const bits = new DataView(new ArrayBuffer(4));
const word = (x) => { bits.setFloat32(0, x, true); return bits.getUint32(0, true); };
const records = capture.records.slice(0, 2);
if (records.length !== 2 || records.some((r) => r.values.length !== 5 || r.knots.length !== 5)) {
  throw new Error('Two authentic five-value records required');
}
const checks = calculated.tables.flatMap((row, i) => row.map((v, k) => word(v) === word(records[i].values[k])));
const knotChecks = calculated.knots.map((v, i) => word(v) === word(records[0].knots[i]));
const result = { note: 69, runtime_curve_mode: 'linear-clamp',
  hardness_values: checks.length, hardness_bit_mismatches: checks.filter((v) => !v).length,
  knots: knotChecks.length, knot_bit_mismatches: knotChecks.filter((v) => !v).length,
  passed: checks.every(Boolean) && knotChecks.every(Boolean),
  complete_voice_or_pcm_verified: false };
const text = JSON.stringify(result, null, 2);
if (reportPath) fs.writeFileSync(reportPath, text);
console.log(text);
process.exitCode = result.passed ? 0 : 1;
