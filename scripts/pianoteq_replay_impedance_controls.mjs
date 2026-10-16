// Usage: node SCRIPT base-models.json preset.json impedance-before.json [report]
import fs from 'node:fs';
import { impedanceControls } from '../dsp/impedance-controls.mjs';
const [basePath, presetPath, runtimePath, reportPath] = process.argv.slice(2);
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const base = read(basePath)[0], preset = read(presetPath), runtime = read(runtimePath);
if (!runtime.records.length || runtime.errors.length) throw new Error('Incomplete capture');
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
const sameArray = (a, b) => a.length === b.length && a.every((v, i) => bits(v) === bits(b[i]));
const failures = [], checks = [];
for (const mode of [0, 1]) {
  const observed = runtime.records.filter(r => r.cache_mode === mode);
  if (!observed.length || observed.some(r => r.note_index !== 69)) throw new Error('Expected actual note69 records for both modes');
  const predicted = impedanceControls({ baseFields: base.fields, presetFields: preset.decoded_tail.fields,
    note: 69, mode, runtimeCurveMode: 'linear-clamp' });
  for (const row of observed) {
    if (row.phase_curve.dimension !== 1 || row.phase_curve.log_x !== 0 || row.phase_curve.special_mode !== 0)
      throw new Error('Captured phase curve requires a different runtime interpretation');
    for (const [key, value] of Object.entries(predicted.controls)) if (bits(value) !== bits(row.controls[key]))
      failures.push({ mode, key, predicted: value, actual: row.controls[key] });
    if (!sameArray(predicted.phaseCurve.x, row.phase_curve.x) || !sameArray(predicted.phaseCurve.y, row.phase_curve.y) ||
        !sameArray(predicted.bandFrequencies, row.band_frequencies) || !sameArray(predicted.bandGains, row.band_gains))
      failures.push({ mode, stage: 'archive-curve-or-band-binding' });
  }
  checks.push({ mode, distinctControlValues: 4, repeatedCapturedCalls: observed.length,
    phaseCoordinates: predicted.phaseCurve.x.length, phaseValues: predicted.phaseCurve.y.length, anchors: predicted.anchors });
}
const result = { checks, failures, passed: failures.length === 0, completeVoiceVerified: false };
const text = JSON.stringify(result, null, 2);
if (reportPath) fs.writeFileSync(reportPath, text + '\n');
console.log(text);
process.exitCode = result.passed ? 0 : 1;
