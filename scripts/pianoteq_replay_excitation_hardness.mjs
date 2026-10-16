import fs from 'node:fs';
import { excitationHardness } from '../dsp/excitation-hardness.mjs';
const [capturePath, reportPath, ...options] = process.argv.slice(2);
let position;
if (options.length) {
  if (options.length !== 2 || options[0] !== '--position-report') throw new Error('Expected --position-report path');
  position = JSON.parse(fs.readFileSync(options[1], 'utf8'));
  if (position.schema !== 'pianoteq-excitation-position-pass27' || !position.passed || position.mismatches)
    throw new Error('Verified computed position report required');
}
const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
if (capture.schema !== 1 || capture.point !== '0x100693ff8' || capture.errors.length || !capture.records.length)
  throw new Error('Complete scalar spectrum-control capture required');
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
if (position && position.predictions.length !== capture.records.length) throw new Error('Source count differs');
const failures = [], predictions = [];
let comparedFloatValues = 0;
function compare(index, key, predicted, actual) {
  if (!Number.isFinite(predicted) || !Number.isFinite(actual)) throw new Error('Nonfinite comparison');
  comparedFloatValues++;
  if (bits(predicted) !== bits(actual)) failures.push({ index, key, predicted, actual });
}
for (const [index, record] of capture.records.entries()) {
  let source = record.source, header = record.header;
  if (position) {
    const p = position.predictions[index];
    if (p.note !== record.note || p.mode !== record.mode || JSON.stringify(p.header) !== JSON.stringify(header))
      throw new Error('Source identity differs');
    for (const key of ['frequency', 'decay', 'amplitude', 'phase']) {
      if (p.source[key].length !== source[key].length) throw new Error('Source dimensions differ');
      p.source[key].forEach((x, i) => compare(index, `${key}-${i}`, x, source[key][i]));
    }
    source = p.source; header = p.header;
  }
  const result = excitationHardness({ ...record, source, header });
  for (const key of ['primary', 'secondary', 'referenceFrequency'])
    compare(index, key, result[key], record.actual[key]);
  predictions.push({ note: record.note, mode: record.mode, ...result });
}
const report = { schema: 'pianoteq-excitation-hardness-pass28', passed: !failures.length,
  comparedFloatValues, mismatches: failures.length, failures, predictions,
  sourceFromComputedPosition: Boolean(position), initialSourceGenerationStillCaptured: true,
  sourceTablesStillCaptured: !position, hardnessCurvesStillCaptured: true, repeatBranchVerified: false,
  editedHardnessVerified: false, fullExcitationGenerationVerified: false, wholeVoiceAudioVerified: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
