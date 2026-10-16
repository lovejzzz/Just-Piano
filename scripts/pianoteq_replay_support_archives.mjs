import fs from 'node:fs';
import { archiveSupportInputs, correctSupportFrequencyDB, normalizeSupportDB, supportDBToLog } from '../dsp/support-archive.mjs';
const [archivePath, bankIndex, curvesPath, frequencyPath, normalizationPath, normalizedPath, consumerPath, reportPath] = process.argv.slice(2);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const bank = read(archivePath)[Number(bankIndex)], curves = read(curvesPath), frequency = read(frequencyPath),
  normalization = read(normalizationPath), normalized = read(normalizedPath), consumer = read(consumerPath);
if (!bank || curves.point !== '0x100676980' || frequency.point !== '0x100765f20' || normalization.point !== '0x10051af20' ||
    normalized.point !== '0x10051b1ec' || consumer.point !== '0x100695248' ||
    [curves, frequency, normalization, normalized, consumer].some(c => c.errors.length || !c.records.length) ||
    normalization.records.length !== normalized.records.length) throw new Error('Complete archive bindings and support-stage observations required');
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
const checks = [], failures = [], groups = new Map(), predictions = [];
function compare(name, predicted, actual) {
  if (predicted.length !== actual.length || !Array.from(predicted).every(Number.isFinite) || !Array.from(actual).every(Number.isFinite))
    throw new Error(`Incomplete ${name}`);
  let mismatches = 0;
  predicted.forEach((x, i) => { if (bits(x) !== bits(actual[i])) {
    mismatches++; if (failures.length < 30) failures.push({ name, index: i, predicted: x, actual: actual[i] });
  } }); checks.push({ name, count: predicted.length, mismatches });
}
const fields = new Map(bank.fields.map(r => [r.object_offset, r.value]));
const binding = curves.records[0];
if (fields.get(0x10e8) !== binding.supportMode) throw new Error('Archive support mode differs');
for (const r of curves.records) if (r.supportMode !== binding.supportMode || JSON.stringify(r.curves) !== JSON.stringify(binding.curves))
  throw new Error('Runtime model bindings differ across notes');
for (const [offset, c] of Object.entries(binding.curves)) {
  const archived = fields.get(Number(offset));
  if (c.log_x !== 0 || c.special_mode !== 0 || archived.y.length / Math.max(1, archived.x.length) !== c.dimension)
    throw new Error('Unverified runtime curve mode');
  compare(`${offset}-archive-x`, archived.x, c.x); compare(`${offset}-archive-y`, archived.y, c.y);
}
const occurrences = new Map();
for (const [index, a] of normalization.records.entries()) {
  const key = `${a.note}-${a.family}`, occurrence = occurrences.get(key) ?? 0;
  const b = normalized.records.filter(r => r.note === a.note && r.family === a.family)[occurrence];
  occurrences.set(key, occurrence + 1);
  if (!b) throw new Error('Normalization identity differs');
  const raw = archiveSupportInputs(bank, a.note, { runtimeMode: 'linear-clamp' })[a.family];
  const corrected = {};
  for (const branch of ['low', 'high']) {
    const r = frequency.records.filter(r => r.note === a.note && r.family === a.family && r.branch === branch)[occurrence];
    if (!r) throw new Error('Missing frequency correction observation');
    compare(`${index}-${branch}-frequency`, raw.frequencies, r.frequencies);
    compare(`${index}-${branch}-raw-db`, raw[`${branch}DB`], r.inputDB);
    const db = correctSupportFrequencyDB({ ...r, frequencies: raw.frequencies, inputDB: raw[`${branch}DB`] });
    compare(`${index}-${branch}-corrected-db`, db, a[branch === 'low' ? 'inputLowDB' : 'inputHighDB']);
    corrected[`${branch}DB`] = db;
  }
  compare(`${index}-normalization-frequency`, raw.frequencies, a.frequencies);
  const result = normalizeSupportDB({ ...a, ...corrected, frequencies: raw.frequencies }, { log10f: x => Math.fround(Math.log10(x)) });
  compare(`${index}-normalized-low`, result.lowDB, b.lowDB); compare(`${index}-normalized-high`, result.highDB, b.highDB);
  const groupKey = `${a.note}-${occurrence}`, group = groups.get(groupKey) ?? { note: a.note, occurrence };
  group[a.family] = { frequencies: raw.frequencies, decay: raw.decay, lowLog: supportDBToLog(result.lowDB), highLog: supportDBToLog(result.highDB) };
  groups.set(groupKey, group);
}
for (const group of groups.values()) {
  if (!group.first || !group.second) throw new Error('Incomplete paired support generation');
  predictions.push({ note: group.note, occurrence: group.occurrence, tables: {
    frequencies: group.first.frequencies, lowLog: group.first.lowLog, highLog: group.first.highLog, decayMultipliers: group.first.decay,
    secondFrequencies: group.second.frequencies, secondLowLog: group.second.lowLog, secondHighLog: group.second.highLog, secondDecay: group.second.decay } });
}
for (const [index, r] of consumer.records.entries()) {
  const candidates = predictions.filter(p => p.note === r.note), p = candidates.at(-1);
  if (!p || r.controls.supportMode !== binding.supportMode || r.controls.supportScale !== 1)
    throw new Error('Unverified support scaling or unmatched consumer note');
  for (const key of Object.keys(p.tables)) compare(`consumer-${index}-${key}`, p.tables[key], r.tables[key]);
}
const report = { schema: 'pianoteq-support-archive-pass33', passed: checks.every(c => !c.mismatches),
  comparedFloatValues: checks.reduce((n, c) => n + c.count, 0), mismatches: checks.reduce((n, c) => n + c.mismatches, 0),
  checks, failures, predictions, rawSupportTablesFromArchive: true, editCurvesAndModalNormalizationInputsStillCaptured: true,
  nativeScalarLog10Implemented: false, fullModelGenerationVerified: false, wholeVoiceAudioVerified: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
