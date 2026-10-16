// Usage: node SCRIPT output-runtime.json decoded-base-models.json constants-runtime.json amplitude-input-runtime.json pow-results.json [report.json]
import fs from 'node:fs';
import { archiveModalSource, sourcePhaseTable, normalizeSourceAmplitudes,
  referenceModeIndex, sourceAmplitudeRow } from '../dsp/modal-source.mjs';
const [runtimePath, archivePath, constantsPath, amplitudePath, powPath, outputPath] = process.argv.slice(2);
if (![runtimePath, archivePath, constantsPath, amplitudePath, powPath].every(Boolean))
  throw new Error('Expected output capture, model archive, constants capture, amplitude input capture and independent pow oracle');
const runtime = JSON.parse(fs.readFileSync(runtimePath));
const banks = JSON.parse(fs.readFileSync(archivePath));
const constants = JSON.parse(fs.readFileSync(constantsPath));
const amplitudeInputs = JSON.parse(fs.readFileSync(amplitudePath));
const powOracle = JSON.parse(fs.readFileSync(powPath));
if (!amplitudeInputs.records.length || amplitudeInputs.errors.length || !powOracle.records.length)
  throw new Error('Incomplete amplitude inputs or independent pow results');
if (!constants.records.length || constants.errors.length) throw new Error('Incomplete constants capture');
const doubleView = new DataView(new ArrayBuffer(8));
for (const row of constants.records) {
  doubleView.setFloat64(0, row.phase_constant);
  if (doubleView.getBigUint64(0).toString(16).padStart(16, '0') !== row.phase_constant_bits)
    throw new Error('Phase constant raw bits differ from captured numeric value');
  if (!Number.isFinite(row.phase_constant) || !Number.isInteger(row.integer_amplitude_scale))
    throw new Error('Invalid native constants');
}
if (new Set(constants.records.map(row => row.phase_constant_bits)).size !== 1 ||
    new Set(constants.records.map(row => row.integer_amplitude_scale)).size !== 1)
  throw new Error('Multiple native configuration values require call-context matching');
const phaseConstant = constants.records[0].phase_constant;
const integerAmplitudeScale = constants.records[0].integer_amplitude_scale;
function doubleBits(value) {
  doubleView.setFloat64(0, value);
  return doubleView.getBigUint64(0).toString(16).padStart(16, '0');
}
const powValues = new Map(), usedPowInputs = new Set();
let jsPowDoubleMismatches = 0;
for (const row of powOracle.records) {
  if (doubleBits(row.result) !== row.result_bits) throw new Error('Pow oracle result bits differ from numeric value');
  const key = doubleBits(row.base) + ':' + doubleBits(row.exponent);
  if (powValues.has(key) && !Object.is(powValues.get(key), row.result)) throw new Error('Inconsistent pow oracle');
  powValues.set(key, row.result);
  jsPowDoubleMismatches += doubleBits(Math.pow(row.base, row.exponent)) !== row.result_bits;
}
function observedPow(base, exponent) {
  const key = doubleBits(base) + ':' + doubleBits(exponent);
  if (!powValues.has(key)) throw new Error('No independent pow oracle for requested input');
  usedPowInputs.add(key);
  return powValues.get(key);
}
if (!runtime.records.length || runtime.errors.length) throw new Error('Incomplete source capture');
const view = new DataView(new ArrayBuffer(4));
function bits(value) { view.setFloat32(0, value); return view.getUint32(0); }
function same(a, b) { return bits(a) === bits(b); }
const failures = [], checks = [];
let archiveValues = 0, phases = 0, phaseMismatches = 0;
let decayValues = 0, amplitudeValues = 0, alignedFrequencyValues = 0;
for (const [recordIndex, record] of runtime.records.entries()) {
  const matches = [];
  for (const bank of banks) {
    let source;
    try { source = archiveModalSource(bank, record.note_index); } catch { continue; }
    const pairs = [
      [source.coordinates, record.cache_vectors['0x1b8']],
      [source.frequencyRatios, record.cache_vectors['0x1f8']],
      [source.componentAmplitudeScale, record.cache_vectors['0x220']],
      [source.componentPowerScale, record.cache_vectors['0x248']],
      [[source.offsetExponent, source.coordinateScale, source.blend],
        [record.cache_controls['0x1a0'], record.cache_controls['0x1e0'], record.cache_controls['0x270']]],
    ];
    if (pairs.every(([a, b]) => a.length === b.length && Array.from(a).every((v, j) => same(v, b[j]))))
      matches.push({ name: bank.strings[0], values: pairs.reduce((n, [a]) => n + a.length, 0) });
  }
  if (!matches.length) failures.push({ stage: 'archive-binding', recordIndex });
  else archiveValues += matches[0].values;
  if (['0x400', '0x418', '0x430', '0x448', '0x460', '0x478'].some(key => record.G_controls[key] !== 0))
    throw new Error('Unverified post-generation phase controls');
  const matrix = record.matrices['0x88'];
  const prediction = sourcePhaseTable(matrix.rows, matrix.cols, record.cache_controls['0x158'], phaseConstant);
  for (let j = 0; j < prediction.length; j++) {
    phases++;
    if (!same(prediction[j], matrix.values[j])) {
      phaseMismatches++;
      failures.push({ stage: 'phase-with-observed-constant', recordIndex, index: j, predicted: prediction[j], actual: matrix.values[j] });
    }
  }
  const frequency = record.matrices['0x10'];
  const matchingInputs = amplitudeInputs.records.filter(input => input.frequency.rows === frequency.rows &&
    input.frequency.cols === frequency.cols && input.frequency.values.length === frequency.values.length &&
    input.frequency.values.every((value, j) => same(value, frequency.values[j])));
  if (matchingInputs.length !== 1) throw new Error('Expected exactly one raw input capture with identical complete frequency matrix');
  const input = matchingInputs[0];
  alignedFrequencyValues += frequency.values.length;
  if (input.raw_decay.rows !== matrix.rows || input.raw_decay.cols !== matrix.cols || input.weights.length < matrix.rows)
    throw new Error('Amplitude input shape differs');
  for (let row = 0; row < matrix.rows; row++) {
    const begin = row * matrix.cols;
    const predicted = sourceAmplitudeRow(input.raw_decay.values.slice(begin, begin + matrix.cols), input.weights[row], {
      addedDecay: input.added_decay, shape: input.shape, eta: input.eta,
      integerScale: integerAmplitudeScale, pow: observedPow,
    });
    for (let component = 0; component < matrix.cols; component++) {
      const index = begin + component;
      decayValues++; amplitudeValues++;
      for (const [stage, prediction, actual] of [
        ['raw-decay-to-decay', predicted.decay[component], record.matrices['0x38'].values[index]],
        ['raw-decay-to-amplitude', predicted.amplitude[component], record.matrices['0x60'].values[index]],
      ]) if (!same(prediction, actual)) failures.push({ stage, recordIndex, row, component, prediction, actual });
    }
  }
  const normalized = normalizeSourceAmplitudes(record.matrices['0x60'].values);
  const referenceIndex = referenceModeIndex(record.matrices['0x10'].values, matrix.cols, record.G_controls['0x78']);
  if (referenceIndex !== record.reference_index) failures.push({ stage: 'reference-index', recordIndex, predicted: referenceIndex, actual: record.reference_index });
  checks.push({ recordIndex, note: record.note, mode: record.mode, rows: matrix.rows, cols: matrix.cols,
    archiveMatches: matches, referenceIndex,
    amplitudeNormalization: { maximumBefore: normalized.maximum, scale: normalized.scale,
      independentlyObservedAfterNormalization: false } });
}
const result = {
  records: runtime.records.length, archiveValues, phases, phaseMismatches,
  decayValues, amplitudeValues, alignedFrequencyValues,
  powOracleRecords: powOracle.records.length, usedUniquePowInputs: usedPowInputs.size,
  jsPowDoubleMismatches, nativeScalarPowImplemented: false,
  phaseConstant, integerAmplitudeScale, constantRecords: constants.records.length,
  phaseRegistryValueDirectlyObserved: true,
  entireFourArrayConstructionVerified: false,
  checks, failures, verifiedStagesPassed: failures.length === 0,
};
const text = JSON.stringify(result, null, 2);
if (outputPath) fs.writeFileSync(outputPath, text + '\n');
console.log(text);
if (failures.length) process.exitCode = 1;
