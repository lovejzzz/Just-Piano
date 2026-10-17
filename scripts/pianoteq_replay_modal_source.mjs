// Usage: node SCRIPT output-runtime.json decoded-base-models.json constants-runtime.json amplitude-input-runtime.json pow-results.json [report.json]
import fs from 'node:fs';
import crypto from 'node:crypto';
import {nativeDoublePow} from '../dsp/native-double-pow.mjs';
import { archiveModalSource, constructModalSource } from '../dsp/modal-source.mjs';
const positional = []; let nativePowMode = false, polesPath, weightsPath;
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (flag === '--native-double-pow' && !nativePowMode) nativePowMode = true;
  else if (flag === '--poles-report' && polesPath === undefined && process.argv[i + 1]) polesPath = process.argv[++i];
  else if (flag === '--weights-report' && weightsPath === undefined && process.argv[i + 1]) weightsPath = process.argv[++i];
  else if (flag.startsWith('--')) throw new Error('Unknown, duplicate or incomplete computed source option');
  else positional.push(flag);
}
if (positional.length > 6 || Boolean(polesPath) !== Boolean(weightsPath) || polesPath && !nativePowMode)
  throw new Error('Computed source bridge requires both reports and native double pow');
const [runtimePath, archivePath, constantsPath, amplitudePath, powPath, outputPath] = positional;
if (![runtimePath, archivePath, constantsPath, amplitudePath, powPath].every(Boolean))
  throw new Error('Expected output capture, model archive, constants capture, amplitude input capture and independent pow oracle');
const runtime = JSON.parse(fs.readFileSync(runtimePath));
const banks = JSON.parse(fs.readFileSync(archivePath));
const constants = JSON.parse(fs.readFileSync(constantsPath));
const amplitudeInputs = JSON.parse(fs.readFileSync(amplitudePath));
const powOracle = JSON.parse(fs.readFileSync(powPath));
let poles, weights; const computedPoleRows = new Map(), computedWeightRows = new Map(), bridgeSources = {};
if (polesPath) {
  for (const [name, file] of [['poles', polesPath], ['weights', weightsPath]]) {
    const bytes = fs.readFileSync(file);
    bridgeSources[name] = {path: file, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
    if (name === 'poles') poles = JSON.parse(bytes); else weights = JSON.parse(bytes);
  }
  if (!poles.passed || poles.failures?.length !== 0 || poles.platformTranscendentalOracleRequired !== false ||
      !poles.fourCouplingArgumentsReconstructed || !poles.complexCouplingParameterProducerReconstructed ||
      poles.frequencyCount !== 108 || poles.decayCount !== 108 || poles.checks?.length !== 36 ||
      [poles.frequencyMismatches, poles.decayMismatches, poles.lambdaMismatches, poles.reconstructedCouplingMismatches].some(n => n !== 0))
    throw new Error('Complete recovered-math coupling and computed pole report required');
  for (const row of poles.checks) {
    const key = `${row.noteIndex}:${row.cacheMode}:${row.row}`;
    if (!row.passed || computedPoleRows.has(key) || !Number.isInteger(row.row) || row.row < 0 ||
        ![row.frequencyErrors, row.decayErrors].every(a => a?.length === 3 && a.every(e => e.bitEqual === true && Number.isFinite(e.predicted))))
      throw new Error('Invalid or duplicate computed pole row');
    computedPoleRows.set(key, row);
  }
  if (!weights.passed || weights.failures?.length !== 0 || !weights.archive_row_identity_verified ||
      !weights.nativeDoubleLogComputed || !weights.nativeDoubleExpComputed || weights.mathCandidateUsed || !weights.predictions?.length)
    throw new Error('Complete recovered-math computed weights report required');
  for (const row of weights.predictions) {
    const key = `${row.note}:${row.noteIndex}`;
    if (computedWeightRows.has(key) || !row.values?.length || !row.values.every(Number.isFinite)) throw new Error('Invalid or duplicate weight row');
    computedWeightRows.set(key, row.values);
  }
}
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
let jsPowDoubleMismatches = nativePowMode ? null : 0, nativePowDoubleMismatches = 0, unmatchedPowComparisonCalls = 0; const computedPowCalls = [];
for (const row of powOracle.records) {
  if (doubleBits(row.result) !== row.result_bits) throw new Error('Pow oracle result bits differ from numeric value');
  const key = doubleBits(row.base) + ':' + doubleBits(row.exponent);
  if (powValues.has(key) && !Object.is(powValues.get(key), row.result)) throw new Error('Inconsistent pow oracle');
  powValues.set(key, row.result);
  if (!nativePowMode) jsPowDoubleMismatches += doubleBits(Math.pow(row.base, row.exponent)) !== row.result_bits;
}
function observedPow(base, exponent) {
  const key = doubleBits(base) + ':' + doubleBits(exponent);
  usedPowInputs.add(key);
  if (nativePowMode) {
    const result = nativeDoublePow(base, exponent);
    const comparisonAvailable = powValues.has(key), bitEqual = comparisonAvailable && doubleBits(result) === doubleBits(powValues.get(key));
    unmatchedPowComparisonCalls += !comparisonAvailable;
    nativePowDoubleMismatches += comparisonAvailable && !bitEqual;
    computedPowCalls.push({base, exponent, result, resultBits: doubleBits(result), comparisonAvailable, bitEqual});
    return result;
  }
  if (!powValues.has(key)) throw new Error('No independent pow oracle for requested input');
  return powValues.get(key);
}
if (!runtime.records.length || runtime.errors.length) throw new Error('Incomplete source capture');
const view = new DataView(new ArrayBuffer(4));
function bits(value) { view.setFloat32(0, value); return view.getUint32(0); }
function same(a, b) { return bits(a) === bits(b); }
const failures = [], checks = [], predictions = []; const usedPoleRows = new Set(), usedWeightRows = new Set();
let archiveValues = 0, phases = 0, phaseMismatches = 0;
let decayValues = 0, amplitudeValues = 0, alignedFrequencyValues = 0;
let computedFrequencyBindings = 0, computedRawDecayBindings = 0, computedWeightBindings = 0;
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
  const frequency = record.matrices['0x10'];
  const matchingInputs = amplitudeInputs.records.filter(input => input.frequency.rows === frequency.rows &&
    input.frequency.cols === frequency.cols && input.frequency.values.length === frequency.values.length &&
    input.frequency.values.every((value, j) => same(value, frequency.values[j])));
  if (matchingInputs.length !== 1) throw new Error('Expected exactly one raw input capture with identical complete frequency matrix');
  const input = matchingInputs[0];
  alignedFrequencyValues += frequency.values.length;
  if (input.raw_decay.rows !== matrix.rows || input.raw_decay.cols !== matrix.cols || input.weights.length < matrix.rows)
    throw new Error('Amplitude input shape differs');
  const ownFrequency = [], ownRawDecay = [];
  let ownWeights = input.weights;
  if (polesPath) {
    const weightKey = `${record.note}:${record.note_index}`;
    ownWeights = computedWeightRows.get(weightKey);
    if (!ownWeights || ownWeights.length !== input.weights.length) throw new Error('Computed harmonic weights do not cover this source');
    usedWeightRows.add(weightKey);
    for (let i = 0; i < ownWeights.length; i++) {
      computedWeightBindings++;
      if (!same(ownWeights[i], input.weights[i])) failures.push({stage: 'computed-weight-binding', recordIndex, index: i, prediction: ownWeights[i], actual: input.weights[i]});
    }
    for (let row = 0; row < matrix.rows; row++) {
      const key = `${record.note_index}:${record.mode}:${row}`, computed = computedPoleRows.get(key);
      if (!computed || usedPoleRows.has(key) || computed.modalCoordinate !== record.modal_coordinates[row]) throw new Error('Computed pole rows do not cover these modal coordinates exactly');
      usedPoleRows.add(key);
      ownFrequency.push(...computed.frequencyErrors.map(e => e.predicted));
      ownRawDecay.push(...computed.decayErrors.map(e => e.predicted));
    }
    for (let i = 0; i < ownFrequency.length; i++) {
      computedFrequencyBindings++; computedRawDecayBindings++;
      if (!same(ownFrequency[i], frequency.values[i])) failures.push({stage: 'computed-frequency-binding', recordIndex, index: i, prediction: ownFrequency[i], actual: frequency.values[i]});
      if (!same(ownRawDecay[i], input.raw_decay.values[i])) failures.push({stage: 'computed-raw-decay-binding', recordIndex, index: i, prediction: ownRawDecay[i], actual: input.raw_decay.values[i]});
    }
  } else {
    ownFrequency.push(...frequency.values);
    ownRawDecay.push(...input.raw_decay.values);
  }
  const built = constructModalSource({frequency: ownFrequency, rawDecay: ownRawDecay, weights: ownWeights, columns: matrix.cols,
    addedDecay: input.added_decay, shape: input.shape, eta: input.eta, integerScale: integerAmplitudeScale,
    phaseAmount: record.cache_controls['0x158'], phaseConstant, referenceFrequency: record.G_controls['0x78']}, {pow: observedPow});
  for (let j = 0; j < built.phase.length; j++) {
    phases++;
    if (!same(built.phase[j], matrix.values[j])) {
      phaseMismatches++;
      failures.push({stage: 'phase-with-observed-constant', recordIndex, index: j, predicted: built.phase[j], actual: matrix.values[j]});
    }
  }
  for (let row = 0; row < matrix.rows; row++) {
    const begin = row * matrix.cols;
    for (let component = 0; component < matrix.cols; component++) {
      const index = begin + component;
      decayValues++; amplitudeValues++;
      for (const [stage, prediction, actual] of [
        ['raw-decay-to-decay', built.decay[index], record.matrices['0x38'].values[index]],
        ['raw-decay-to-amplitude', built.amplitude[index], record.matrices['0x60'].values[index]],
      ]) if (!same(prediction, actual)) failures.push({ stage, recordIndex, row, component, prediction, actual });
    }
  }
  const referenceIndex = built.referenceIndex;
  if (referenceIndex !== record.reference_index) failures.push({ stage: 'reference-index', recordIndex, predicted: referenceIndex, actual: record.reference_index });
  checks.push({ recordIndex, note: record.note, mode: record.mode, rows: matrix.rows, cols: matrix.cols,
    archiveMatches: matches, referenceIndex,
    amplitudeNormalization: { maximumBefore: built.normalizationMaximum, scale: built.normalizationScale,
      independentlyObservedAfterNormalization: false } });
  predictions.push({note: record.note, noteIndex: record.note_index, mode: record.mode, rows: matrix.rows, cols: matrix.cols,
    frequency: Array.from(built.frequency), rawDecay: Array.from(built.rawDecay), decay: Array.from(built.decay), amplitude: Array.from(built.amplitude), phase: Array.from(built.phase),
    normalizedAmplitude: Array.from(built.normalizedAmplitude), normalizationCompared: false, referenceIndex});
}
if (polesPath && (usedPoleRows.size !== computedPoleRows.size || usedWeightRows.size !== computedWeightRows.size)) throw new Error('Unused computed source rows or missing coverage');
if (nativePowDoubleMismatches) failures.push({stage: 'native-pow-comparison', mismatches: nativePowDoubleMismatches});
if (unmatchedPowComparisonCalls) failures.push({stage: 'missing-pow-comparison', calls: unmatchedPowComparisonCalls});
const result = {
  records: runtime.records.length, archiveValues, phases, phaseMismatches,
  decayValues, amplitudeValues, alignedFrequencyValues,
  powOracleRecords: powOracle.records.length, usedUniquePowInputs: usedPowInputs.size,
  jsPowDoubleMismatches, nativeScalarPowImplemented: nativePowMode, nativePowDoubleMismatches, unmatchedPowComparisonCalls, computedPowCalls,
  powOracleComparisonOnly: nativePowMode, frequencyAndRawDecayFromComputedPoles: Boolean(polesPath), harmonicWeightsFromComputedReport: Boolean(weightsPath),
  computedFrequencyBindings, computedRawDecayBindings, computedWeightBindings, bridgeSources,
  crossRunHistoricalBridge: Boolean(polesPath), sameRunWholeVoiceVerified: false,
  phaseConstant, integerAmplitudeScale, constantRecords: constants.records.length,
  phaseRegistryValueDirectlyObserved: true,
  entireFourArrayConstructionVerified: false,
  predictions, checks, failures, verifiedStagesPassed: failures.length === 0,
};
const text = JSON.stringify(result, null, 2);
if (outputPath) fs.writeFileSync(outputPath, text + '\n');
console.log(text);
if (failures.length) process.exitCode = 1;
