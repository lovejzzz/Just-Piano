// Verify a freshly composed archive tuning producer; observations are targets only.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {bindDurationSource} from './pianoteq_bind_duration_source.mjs';
import {constructArchiveDurationTuning} from '../dsp/archive-release-duration.mjs';
const [sourceFile, finalFile, stretchedFile, tableFile, reportFile, ...extra] = process.argv.slice(2);
if (!reportFile || extra.length) throw new Error('Usage: duration-source final-capture stretched-capture stretch-table-capture fresh-report');
const files = {source: sourceFile, final: finalFile, stretched: stretchedFile, table: tableFile};
const bytes = Object.fromEntries(Object.entries(files).map(([k, p]) => [k, fs.readFileSync(p)]));
const source = bindDurationSource(bytes.source), own = constructArchiveDurationTuning(source);
const final = JSON.parse(bytes.final), stretched = JSON.parse(bytes.stretched), table = JSON.parse(bytes.table);
if (final.point !== '0x1008a3c60' || stretched.point !== '0x1009626b4' || table.point !== '0x1003283d8' ||
    [final, stretched, table].some(d => !Array.isArray(d.records) || !d.records.length || !Array.isArray(d.errors) || d.errors.length) ||
    table.records.length !== 1 || table.records[0].table.length !== 128 || final.records.length !== stretched.records.length)
  throw new Error('Authentic complete explicit tuning target stages required');
let checks = 0; const failures = [], notes = new Set();
function check(name, p, a) {
  checks++;
  if (!Number.isFinite(p) || !Number.isFinite(a) || !Object.is(p, a)) failures.push({name, predicted: p, actual: a});
}
own.stretchTable.forEach((v, i) => check(`stretch-table:${i}`, v, table.records[0].table[i]));
for (const r of final.records) {
  if (!Number.isInteger(r.note) || r.note !== r.note_index || r.note < 0 || r.note > 127)
    throw new Error('Explicit integer target note required');
  notes.add(r.note); const p = own.sources[r.note];
  for (const [key, v] of Object.entries({'0x58': p.output.baseline, '0x5c': p.output.anchored,
    '0x60': p.output.referenceRatio, '0x78': p.output.frequency, '0x80': p.stretch.factor}))
    check(`${r.note}:${key}`, v, r.G_controls[key]);
}
for (const r of stretched.records) {
  if (!notes.has(r.note) || r.note !== r.note_index) throw new Error('Matching tuning target range required');
  const p = own.sources[r.note];
  check(`${r.note}:pre-anchor`, p.stretch.frequency, r.G_controls['0x5c']);
  check(`${r.note}:factor`, p.stretch.factor, r.G_controls['0x80']);
  check(`${r.note}:initial-ratio`, p.output.initialRatio, r.G_controls['0x60']);
}
if (notes.size !== 105 || final.records.length !== 315 ||
    [...notes].sort((a, b) => a - b).some((n, i) => n !== 9 + i) ||
    [...notes].some(n => [final, stretched].some(d => d.records.filter(r => r.note === n).length !== 3)))
  throw new Error('Complete preserved 105-note traversal required');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const report = {schema: 'pianoteq-archive-duration-tuning-pass250', passed: !failures.length,
  checks, mismatches: failures.length, failures, distinctNotes: notes.size, finalRecords: final.records.length,
  archiveSourceSha256: sha(bytes.source), inputHashes: Object.fromEntries(Object.entries(bytes).map(([k, b]) => [k, sha(b)])),
  predictionSha256: sha(Buffer.from(JSON.stringify(own))), resourceSha256: source.resourceSha256,
  presetSha256: source.presetSha256, nativeFrequencyUsedAsInput: false, nativeStretchTableUsedAsInput: false,
  nativeStiffnessTableUsedAsInput: false, registryAndCurveModesStillObserved: true,
  crossRunTuningAudit: true, audioSamplesCompared: 0, finalStereoAudioVerified: false};
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({...report, failures: undefined}));
if (!report.passed) process.exitCode = 1;
