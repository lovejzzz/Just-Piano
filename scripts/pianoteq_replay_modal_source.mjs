// Usage: node SCRIPT output-runtime.json decoded-base-models.json constants-runtime.json amplitude-input-runtime.json pow-results.json [report.json]
import fs from 'node:fs';
import crypto from 'node:crypto';
import {nativeDoublePow} from '../dsp/native-double-pow.mjs';
import {archiveAmplitudeControls} from '../dsp/source-amplitude-controls.mjs';
import {archivePhaseAmount} from '../dsp/source-phase-controls.mjs';
import { archiveModalSource, constructModalSource } from '../dsp/modal-source.mjs';
const positional = []; let nativePowMode = false, polesPath, weightsPath, amplitudePresetPath, amplitudeLinearCurves = false, phaseInstrumentMode, tuningPath;
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (flag === '--native-double-pow' && !nativePowMode) nativePowMode = true;
  else if (flag === '--poles-report' && polesPath === undefined && process.argv[i + 1]) polesPath = process.argv[++i];
  else if (flag === '--weights-report' && weightsPath === undefined && process.argv[i + 1]) weightsPath = process.argv[++i];
  else if (flag === '--amplitude-preset' && amplitudePresetPath === undefined && process.argv[i + 1]) amplitudePresetPath = process.argv[++i];
  else if (flag === '--amplitude-linear-curves' && !amplitudeLinearCurves) amplitudeLinearCurves = true;
  else if (flag === '--archive-phase-mode' && phaseInstrumentMode === undefined && /^\d+$/.test(process.argv[i + 1] ?? '')) phaseInstrumentMode = Number(process.argv[++i]);
  else if (flag === '--tuning-report' && tuningPath === undefined && process.argv[i + 1]) tuningPath = process.argv[++i];
  else if (flag.startsWith('--')) throw new Error('Unknown, duplicate or incomplete computed source option');
  else positional.push(flag);
}
if (positional.length > 6 || Boolean(polesPath) !== Boolean(weightsPath) || polesPath && !nativePowMode)
  throw new Error('Computed source bridge requires both reports and native double pow');
if (Boolean(amplitudePresetPath) !== amplitudeLinearCurves || amplitudePresetPath && !polesPath)
  throw new Error('Archive amplitude source requires computed bridge and explicit linear curve modes');
if ((phaseInstrumentMode !== undefined || tuningPath) && (!amplitudePresetPath || phaseInstrumentMode > 255))
  throw new Error('Phase/tuning source requires archive amplitude context and valid mode byte');
const [runtimePath, archivePath, constantsPath, amplitudePath, powPath, outputPath] = positional;
if (![runtimePath, archivePath, constantsPath, amplitudePath, powPath].every(Boolean))
  throw new Error('Expected output capture, model archive, constants capture, amplitude input capture and independent pow oracle');
const runtime = JSON.parse(fs.readFileSync(runtimePath));
const banks = JSON.parse(fs.readFileSync(archivePath));
const constants = JSON.parse(fs.readFileSync(constantsPath));
const amplitudeInputs = JSON.parse(fs.readFileSync(amplitudePath));
const powOracle = JSON.parse(fs.readFileSync(powPath));
const amplitudePresetBytes = amplitudePresetPath ? fs.readFileSync(amplitudePresetPath) : undefined;
const amplitudePreset = amplitudePresetBytes ? JSON.parse(amplitudePresetBytes) : undefined;
if (amplitudePreset && !amplitudePreset.decoded_tail?.fields) throw new Error('Decoded amplitude preset required');
const tuningBytes = tuningPath ? fs.readFileSync(tuningPath) : undefined, tuning = tuningBytes ? JSON.parse(tuningBytes) : undefined;
const tuningFrequencies = new Map();
if (tuning) {
  if (tuning.schema !== 'pianoteq-source-tuning-pass17' || !tuning.passed || tuning.failures?.length !== 0 ||
      !tuning.archivePitchCurveVerified || tuning.floatMismatches !== 0 || tuning.uniqueNotes !== 105 || tuning.predictedSources?.length !== 105)
    throw new Error('Complete verified source tuning report required');
  for (const row of tuning.predictedSources) {
    if (tuningFrequencies.has(row.key) || !Number.isFinite(row.frequency) || row.frequency <= 0) throw new Error('Invalid or duplicate tuning source');
    tuningFrequencies.set(row.key, row.frequency);
  }
}
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
let amplitudeControlBindings = 0, amplitudeRegistryBindings = 0; const amplitudeControlPredictions = [];
let phaseControlBindings = 0, referenceFrequencyBindings = 0; const phaseControlPredictions = [];
for (const [recordIndex, record] of runtime.records.entries()) {
  const matches = [];
  const matchedBanks = [];
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
    if (pairs.every(([a, b]) => a.length === b.length && Array.from(a).every((v, j) => same(v, b[j])))) {
      matches.push({ name: bank.strings[0], values: pairs.reduce((n, [a]) => n + a.length, 0) });
      matchedBanks.push(bank);
    }
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
  let amplitudeControls = {addedDecay: input.added_decay, shape: input.shape, eta: input.eta};
  if (amplitudePreset) {
    if (matchedBanks.length !== 1) throw new Error('Archive amplitude source needs unique base model');
    const runtimeCurveModes = Object.fromEntries(['B25b0', 'B26f0', 'B2790', 'A530'].map(name => [name, {flags: 0, special: 0, dimension: 1}]));
    amplitudeControls = archiveAmplitudeControls({baseFields: matchedBanks[0].fields, presetFields: amplitudePreset.decoded_tail.fields,
      note: record.note, components: matrix.cols, runtimeCurveModes});
    amplitudeControlPredictions.push({recordIndex, ...amplitudeControls});
    for (const [name, value, actual] of [['addedDecay', amplitudeControls.addedDecay, input.added_decay],
      ['shape', amplitudeControls.shape, input.shape], ['shapeDb', amplitudeControls.shapeDb, input.shape_db], ['eta', amplitudeControls.eta, input.eta]]) {
      amplitudeControlBindings++;
      if (!Object.is(value, actual)) failures.push({stage: 'archive-amplitude-control-binding', recordIndex, name, prediction: value, actual});
    }
    for (const [name, value, actual] of [['G160', amplitudeControls.addedDecay, record.G_controls['0x160']],
      ['cache128', amplitudeControls.shape, record.cache_controls['0x128']], ['cache188', amplitudeControls.shapeDb, record.cache_controls['0x188']]]) {
      amplitudeRegistryBindings++;
      if (!same(value, actual)) failures.push({stage: 'archive-amplitude-registry-binding', recordIndex, name, prediction: value, actual});
    }
  }
  let phaseAmount = record.cache_controls['0x158'], referenceFrequency = record.G_controls['0x78'];
  if (phaseInstrumentMode !== undefined) {
    if (matchedBanks.length !== 1) throw new Error('Archive phase source needs unique base model');
    const controls = archivePhaseAmount({baseFields: matchedBanks[0].fields, note: record.note, instrumentMode: phaseInstrumentMode,
      runtimeCurveMode: {flags: 0, special: 0, dimension: 1}});
    phaseAmount = controls.phaseAmount;
    phaseControlPredictions.push({recordIndex, ...controls});
    for (const [name, actual] of [['cache158', record.cache_controls['0x158']], ['amplitude-random-amount', input.random_amount]]) {
      phaseControlBindings++;
      if (!same(phaseAmount, actual)) failures.push({stage: 'archive-phase-binding', recordIndex, name, prediction: phaseAmount, actual});
    }
  }
  if (tuning) {
    referenceFrequency = tuningFrequencies.get(`${record.note_index}:${record.note}`);
    if (!Number.isFinite(referenceFrequency)) throw new Error('Tuning predictions do not cover this source');
    referenceFrequencyBindings++;
    if (!same(referenceFrequency, record.G_controls['0x78'])) failures.push({stage: 'computed-reference-frequency-binding', recordIndex, prediction: referenceFrequency, actual: record.G_controls['0x78']});
  }
  const built = constructModalSource({frequency: ownFrequency, rawDecay: ownRawDecay, weights: ownWeights, columns: matrix.cols,
    ...amplitudeControls, integerScale: integerAmplitudeScale,
    phaseAmount, phaseConstant, referenceFrequency}, {pow: observedPow});
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
  if (phaseInstrumentMode !== undefined || tuning) Object.assign(predictions.at(-1), {phaseAmount, referenceFrequency});
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
  sourceAmplitudeControlsFromArchives: Boolean(amplitudePreset), amplitudeControlBindings, amplitudeRegistryBindings, amplitudeControlPredictions,
  amplitudeRuntimeCurveModesSupplied: amplitudeLinearCurves, amplitudeRuntimeCurveModesNewlyObserved: false,
  amplitudePresetSource: amplitudePresetBytes ? {path: amplitudePresetPath, sha256: crypto.createHash('sha256').update(amplitudePresetBytes).digest('hex')} : undefined,
  phaseAmountFromArchive: phaseInstrumentMode !== undefined, phaseInstrumentModeSupplied: phaseInstrumentMode, phaseInstrumentModeNewlyObserved: false,
  phaseControlBindings, phaseControlPredictions, referenceFrequencyFromTuning: Boolean(tuning), referenceFrequencyBindings,
  tuningSource: tuningBytes ? {path: tuningPath, sha256: crypto.createHash('sha256').update(tuningBytes).digest('hex'), nativeMathOracleRequired: tuning.nativeMathOracleRequired,
    stretchTableProducerReconstructed: tuning.stretchTableProducerReconstructed, stretchTableComputedFromSystem: tuning.stretchTableComputedFromSystem,
    stretchRhsStillCaptured: tuning.stretchRhsStillCaptured, stretchSource: tuning.stretchSource} : undefined,
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
