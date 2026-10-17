// Reject incompatible historical source tables before any voice substitution.
// This is a binding audit, not a parameter fit or a whole-engine sound test.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { archiveExcitationMixCoefficients, mixExcitationComponents } from '../dsp/excitation-component-mix.mjs';
const [capturePath, candidatePath, outputPath, ...options] = process.argv.slice(2);
if (!outputPath) throw new Error('Capture, computed source and new output paths required');
let presetPair, mixArchive;
for (let i = 0; i < options.length;) {
  const option = options[i++], first = options[i++], second = options[i++];
  if (!first || !second) throw new Error('Each option requires two arguments');
  if (option === '--preset-pair' && !presetPair) presetPair = [first, second];
  else if (option === '--mix-archive' && !mixArchive && /^\d+$/.test(second)) mixArchive = [first, Number(second)];
  else throw new Error('Expected unique --preset-pair first.json second.json or --mix-archive banks.json index');
}
const captureBytes = fs.readFileSync(capturePath), candidateBytes = fs.readFileSync(candidatePath);
const capture = JSON.parse(captureBytes), candidate = JSON.parse(candidateBytes);
if (!capture.complete || capture.errors?.length !== 0 || !capture.records?.length || candidate.verifiedStagesPassed !== true ||
    candidate.failures?.length !== 0 || !candidate.frequencyAndRawDecayFromComputedPoles || !candidate.harmonicWeightsFromComputedReport ||
    !candidate.predictions?.length) throw new Error('Complete capture and verified computed source required');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let mixBank, mixArchiveSha256;
if (mixArchive) {
  const bytes = fs.readFileSync(mixArchive[0]);
  mixBank = JSON.parse(bytes)[mixArchive[1]];
  if (!mixBank?.fields) throw new Error('Explicit decoded base-model index required');
  mixArchiveSha256 = sha(bytes);
}
const word = new DataView(new ArrayBuffer(4));
const bits = x => { word.setFloat32(0, x); return word.getUint32(0); };
function fingerprint(values) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((x, i) => bytes.writeFloatLE(x, i * 4)); return sha(bytes);
}
const predictions = new Map();
for (const row of candidate.predictions) {
  const key = `${row.note}:${row.mode}`;
  if (predictions.has(key) || !Number.isInteger(row.rows) || row.rows < 1 || !Number.isInteger(row.cols) || row.cols < 1 ||
      !['frequency', 'decay', 'normalizedAmplitude', 'phase'].every(name => row[name]?.length === row.rows * row.cols && row[name].every(Number.isFinite)))
    throw new Error('Ambiguous or incomplete computed source');
  predictions.set(key, row);
}
const checks = [], failures = [], hashes = new Map(), used = new Set(), epochs = new Map();
let comparedValues = 0, mismatches = 0;
for (const record of capture.records) {
  if (record.stage !== 'weights') continue;
  const input = record.input, key = `${input.note}:${input.mode}`, predicted = predictions.get(key), owner = `${record.epoch}:${input.mode}`;
  if (!predicted || used.has(owner) || input.header?.[0] !== predicted.cols || input.header[1] !== predicted.rows || input.size !== predicted.rows * predicted.cols)
    throw new Error('Unmatched, duplicate or differently shaped source context');
  used.add(owner); epochs.set(record.epoch, (epochs.get(record.epoch) ?? 0) + 1);
  // 695108 observes the table after the 692ffc prefix, not the untouched cache.
  // Other intervening transforms remain unresolved; do not infer equivalence.
  const mix = mixBank ? mixExcitationComponents({ amplitude: predicted.normalizedAmplitude, columns: predicted.cols,
    ...archiveExcitationMixCoefficients(mixBank, input.note, {runtimeMode: 'linear-clamp'}),
    velocity: input.controls?.velocity, attenuation: input.controls?.attenuation,
    blendFloor: input.controls?.blendFloor, inputBlend: input.controls?.inputBlend }) : undefined;
  const arrays = {}, tableHashes = {}, columnHashes = {};
  for (const [name, field] of [['frequency', 'frequency'], ['decay', 'decay'], ['amplitude', 'normalizedAmplitude'], ['phase', 'phase']]) {
    const actual = input.source[name], calculated = name === 'amplitude' && mix ? mix.amplitude : predicted[field];
    if (actual?.length !== calculated.length || !actual.every(Number.isFinite)) throw new Error('Complete native source arrays required');
    const perColumn = Array(predicted.cols).fill(0); let count = 0;
    for (let i = 0; i < actual.length; i++) {
      comparedValues++;
      if (bits(actual[i]) !== bits(calculated[i])) {
        count++; mismatches++; perColumn[i % predicted.cols]++;
        if (failures.length < 40) failures.push({epoch: record.epoch, mode: input.mode, name, index: i,
          native: actual[i], computed: calculated[i], nativeBits: bits(actual[i]).toString(16).padStart(8, '0'), computedBits: bits(calculated[i]).toString(16).padStart(8, '0')});
      }
    }
    arrays[name] = {compared: actual.length, mismatches: count, perColumn, predictionSha256: fingerprint(calculated)};
    tableHashes[name] = fingerprint(actual);
    columnHashes[name] = Array.from({length: predicted.cols}, (_, column) => fingerprint(actual.filter((_, i) => i % predicted.cols === column)));
  }
  if (!hashes.has(key)) hashes.set(key, []);
  hashes.get(key).push({epoch: record.epoch, hashes: tableHashes, columnHashes});
  checks.push({epoch: record.epoch, mode: input.mode, rows: predicted.rows, columns: predicted.cols, arrays,
    mix: mix && {coefficients: mix.coefficients, blend: mix.blend, control: mix.control, weight: mix.weight, upper: mix.upper}});
}
if (checks.length !== capture.spectrumCount || !checks.length || epochs.size !== capture.starts || [...epochs.values()].some(n => n !== predictions.size))
  throw new Error('Incomplete source-mode coverage');
const clean = value => Array.isArray(value) ? value.map(clean) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([k]) => !['offset', 'end_offset'].includes(k)).map(([k, v]) => [k, clean(v)])) : value;
let presetComparison;
if (presetPair) {
  const [firstPath, secondPath] = presetPair, firstBytes = fs.readFileSync(firstPath), secondBytes = fs.readFileSync(secondPath);
  const first = JSON.parse(firstBytes), second = JSON.parse(secondBytes);
  if (!first.decoded_tail?.fields || !second.decoded_tail?.fields) throw new Error('Decoded preset pair required');
  const a = new Map(first.decoded_tail.fields.map(row => [row.object_offset, clean(row.value)]));
  const b = new Map(second.decoded_tail.fields.map(row => [row.object_offset, clean(row.value)]));
  const changedOffsets = [...new Set([...a.keys(), ...b.keys()])].filter(k => JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k)));
  presetComparison = {firstPath, secondPath, firstSha256: sha(firstBytes), secondSha256: sha(secondBytes), changedObjectOffsets: changedOffsets.map(n => '0x' + n.toString(16)),
    doesNotProveRuntimeModelIdentity: true};
}
const stability = [...hashes].map(([key, rows]) => ({key, observations: rows.length,
  stableAcrossObservedStrikes: rows.every(r => JSON.stringify(r.hashes) === JSON.stringify(rows[0].hashes)),
  uniqueFingerprintsByArray: Object.fromEntries(Object.keys(rows[0].hashes).map(name => [name, new Set(rows.map(r => r.hashes[name])).size])),
  uniqueFingerprintsByColumn: Object.fromEntries(Object.keys(rows[0].columnHashes).map(name => [name,
    rows[0].columnHashes[name].map((_, column) => new Set(rows.map(r => r.columnHashes[name][column])).size)])), rows}));
const result = {passed: mismatches === 0, compatible: mismatches === 0, bindingAuditOnly: true,
  comparedValues, mismatches, captureSha256: sha(captureBytes), candidateSha256: sha(candidateBytes), checks, failures, stability, presetComparison,
  candidateAmplitudeNormalizationOriginallyObserved: false, correctionFitApplied: false,
  amplitudeMixComputedFromArchive: Boolean(mixBank), mixArchiveSha256,
  mixArchiveIndex: mixArchive?.[1], mixRuntimeCurveModeSupplied: mixBank ? 'linear-clamp' : undefined,
  mixRuntimeCurveModeNewlyObserved: false, interveningSourceTransformsFullyReconstructed: false,
  substitutedIntoVoice: false, sameRunModelGenerationVerified: false, finalStereoVerified: false};
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({...result, failures: undefined, checks: undefined, stability: stability.map(({rows, ...r}) => r)}));
if (!result.passed) process.exitCode = 1;
