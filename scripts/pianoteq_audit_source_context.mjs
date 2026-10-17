// Reject incompatible historical source tables before any voice substitution.
// This is a binding audit, not a parameter fit or a whole-engine sound test.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import { archiveExcitationMixCoefficients, mixExcitationComponents } from '../dsp/excitation-component-mix.mjs';
import {archiveNeighborControls, mixNeighborExcitation} from '../dsp/excitation-neighbor-controls.mjs';
import {archiveExcitationDecayControls, excitationDecayFromControls, scaleExcitationDecay} from '../dsp/excitation-decay-controls.mjs';
import {archiveFrequencyVariationControls, rewindExcitationRandom, secondaryFrequencySeed, varyExcitationFrequencies} from '../dsp/excitation-frequency-variation.mjs';
import {ExcitationManagerRandom} from '../dsp/excitation-manager-random.mjs';
import {prepareNoteOnVelocitySource} from './pianoteq_note_on_velocity_source.mjs';
import {prepareArchiveHardnessSource} from './pianoteq_archive_hardness_source.mjs';
const [capturePath, candidatePath, outputPath, ...options] = process.argv.slice(2);
if (!outputPath) throw new Error('Capture, computed source and new output paths required');
let presetPair, mixArchive, neighborOracle, decaySource, frequencySource, eventVelocityMidi, hardnessSourceRequested=false, nativeNeighborMath = false;
for (let i = 0; i < options.length;) {
  const option = options[i++];
  if (option === '--native-neighbor-math' && !nativeNeighborMath) {nativeNeighborMath = true; continue;}
  const first = options[i++];
  if (option === '--neighbor-math-oracle' && first && !neighborOracle) {neighborOracle = first; continue;}
  const second = options[i++];
  if (!first || !second) throw new Error('Each option requires two arguments');
  if (option === '--preset-pair' && !presetPair) presetPair = [first, second];
  else if (option === '--mix-archive' && !mixArchive && /^\d+$/.test(second)) mixArchive = [first, Number(second)];
  else if (option === '--decay-source' && !decaySource && second === 'ordinary-host-zero') decaySource = first;
  else if (option === '--frequency-source' && !frequencySource && first === '1' && ['captured-post-jitter-state', 'manager-reset-seed-zero'].includes(second)) frequencySource = second;
  else if (option === '--event-velocity' && !eventVelocityMidi && second === 'velocity-over-128-seed-zero') eventVelocityMidi = first;
  else if (option === '--hardness-source' && !hardnessSourceRequested && first === '69' && second === 'all-zero') hardnessSourceRequested=true;
  else throw new Error('Expected unique --preset-pair first.json second.json or --mix-archive banks.json index');
}
if (nativeNeighborMath && neighborOracle) throw new Error('Choose native neighbor math or an explicit diagnostic oracle');
const neighborEnabled = nativeNeighborMath || Boolean(neighborOracle);
if (neighborEnabled && !mixArchive) throw new Error('Neighbor preparation requires explicit mix archive');
if (decaySource && !mixArchive) throw new Error('Decay preparation requires explicit base archive');
if (frequencySource && !mixArchive) throw new Error('Frequency preparation requires explicit base archive');
const captureBytes = fs.readFileSync(capturePath), candidateBytes = fs.readFileSync(candidatePath);
const capture = JSON.parse(captureBytes), candidate = JSON.parse(candidateBytes);
if (!capture.complete || capture.errors?.length !== 0 || !capture.records?.length || candidate.verifiedStagesPassed !== true ||
    candidate.failures?.length !== 0 || !candidate.frequencyAndRawDecayFromComputedPoles || !candidate.harmonicWeightsFromComputedReport ||
    !candidate.predictions?.length) throw new Error('Complete capture and verified computed source required');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const mathCalls = new Map(), mathWord = new DataView(new ArrayBuffer(8));
const encode = value => {mathWord.setFloat64(0, value); return mathWord.getBigUint64(0).toString(16).padStart(16, '0');};
const nativeMath = operation => (x, y) => {
  const key = [operation, encode(x), encode(y)].join(':');
  if (!mathCalls.has(key)) {
    const result = spawnSync(neighborOracle, [operation, encode(x), encode(y)], {encoding: 'utf8'});
    if (result.status !== 0 || !/^[0-9a-f]{16}\s*$/.test(result.stdout)) throw new Error('Native neighbor math oracle failed');
    mathWord.setBigUint64(0, BigInt('0x' + result.stdout.trim()));
    const value = mathWord.getFloat64(0);
    if (!Number.isFinite(value)) throw new Error('Nonfinite neighbor math result');
    mathCalls.set(key, {operation, x, y, value});
  }
  return mathCalls.get(key).value;
};
let mixBank, mixArchiveSha256;
if (mixArchive) {
  const bytes = fs.readFileSync(mixArchive[0]);
  mixBank = JSON.parse(bytes)[mixArchive[1]];
  if (!mixBank?.fields) throw new Error('Explicit decoded base-model index required');
  mixArchiveSha256 = sha(bytes);
}
const decayPresetBytes = decaySource ? fs.readFileSync(decaySource) : undefined;
const decayPreset = decayPresetBytes ? JSON.parse(decayPresetBytes) : undefined;
if (eventVelocityMidi && (!decayPreset || !mixBank || frequencySource !== 'manager-reset-seed-zero'))
  throw new Error('Event velocity requires decoded base/preset and forward manager random conditions');
const eventVelocity = eventVelocityMidi ? prepareNoteOnVelocitySource(fs.readFileSync(eventVelocityMidi),mixBank,decayPreset) : undefined;
if(hardnessSourceRequested && (!mixBank || !decayPreset))throw new Error('Hardness preparation requires decoded base and preset');
const archiveHardness=hardnessSourceRequested?prepareArchiveHardnessSource(mixBank,decayPreset):undefined;
const hardnessChecks=[];
let hardnessMismatches=0;
const velocityChecks=[];
let velocityMismatches=0;
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
const managerRandom = frequencySource === 'manager-reset-seed-zero' ? new ExcitationManagerRandom({configurationSeed: 0, eventBranch: 'velocity-randomization-enabled'}) : undefined;
const managerRandomStateChecks = [];
let randomStateMismatches = 0;
let comparedValues = 0, mismatches = 0;
for (const record of capture.records) {
  if (eventVelocity && ['before','weights'].includes(record.stage)) {
    const event=eventVelocity.events[record.epoch], actual=record.stage==='before'?record.inputs?.newVelocity:record.input?.controls?.velocity;
    if (!event || event.note !== (record.stage==='before'?record.note:record.input?.note) || !Number.isFinite(actual))
      throw new Error('Complete matching MIDI/voice velocity boundary required');
    const equal=bits(event.velocity)===bits(actual);
    velocityChecks.push({epoch:record.epoch,stage:record.stage,mode:record.input?.mode,predicted:event.velocity,actual,bitEqual:equal});
    if(!equal)velocityMismatches++;
  }
  if (record.stage !== 'weights') continue;
  const input = record.input, key = `${input.note}:${input.mode}`, predicted = predictions.get(key), owner = `${record.epoch}:${input.mode}`;
  if (!predicted || used.has(owner) || input.header?.[0] !== predicted.cols || input.header[1] !== predicted.rows || input.size !== predicted.rows * predicted.cols)
    throw new Error('Unmatched, duplicate or differently shaped source context');
  used.add(owner); epochs.set(record.epoch, (epochs.get(record.epoch) ?? 0) + 1);
  if(archiveHardness){
    if(input.note!==69 || input.controls.u!==0 || input.controls.hardnessMode!==0)
      throw new Error('Only note69, zero edit, ordinary hardness mode is covered');
    for(const family of ['primary','secondary'])for(const name of ['knots','values']){
      const calculated=archiveHardness.curves[family][name],actual=input.curves?.[family]?.[name];
      if(actual?.length!==5||!actual.every(Number.isFinite))throw new Error('Complete five-node hardness comparison target required');
      const count=calculated.filter((v,i)=>bits(v)!==bits(actual[i])).length;
      hardnessMismatches+=count;hardnessChecks.push({epoch:record.epoch,mode:input.mode,family,name,
        compared:5,mismatches:count,predicted:calculated,actual});
    }
  }
  const velocity = eventVelocity ? eventVelocity.events[record.epoch].velocity : input.controls?.velocity;
  // 695108 observes the table after the 692ffc prefix, not the untouched cache.
  // Other intervening transforms remain unresolved; do not infer equivalence.
  const mix = mixBank ? mixExcitationComponents({ amplitude: predicted.normalizedAmplitude, columns: predicted.cols,
    ...archiveExcitationMixCoefficients(mixBank, input.note, {runtimeMode: 'linear-clamp'}),
    velocity, attenuation: input.controls?.attenuation,
    blendFloor: input.controls?.blendFloor, inputBlend: input.controls?.inputBlend }) : undefined;
  const neighborControls = neighborEnabled ? archiveNeighborControls(mixBank, input.note,
    nativeNeighborMath ? {runtimeMode: 'linear-clamp'} : {runtimeMode: 'linear-clamp', atan2f: nativeMath('atan2f')}) : undefined;
  const neighbor = neighborControls ? mixNeighborExcitation({amplitude: mix.amplitude, phase: predicted.phase, columns: predicted.cols},
    {...neighborControls, floor: input.controls.blendFloor, blend: input.controls.inputBlend,
      mix: Math.max(Math.fround(input.controls.blendFloor), Math.fround(input.controls.inputBlend))}) : undefined;
  const decayControls = decayPreset ? archiveExcitationDecayControls(mixBank, decayPreset, input.note, {runtimeCurveMode: 'linear-clamp'}) : undefined;
  const decayModel = decayControls ? excitationDecayFromControls(decayControls, velocity, {hostMode: 0, noteBranch: 'ordinary'}) : undefined;
  const decay = decayModel ? scaleExcitationDecay(predicted.decay, decayModel.gain) : undefined;
  let variation, variationControls, initialRandomState, managerInitialization;
  if (frequencySource) {
    variationControls = archiveFrequencyVariationControls(mixBank, input.note, {instrumentMode: 1, runtimeCurveMode: 'linear-clamp'});
    if (![0, 1].includes(input.mode)) throw new Error('Unverified frequency source mode');
    const primary = input.mode === 0, spread = primary ? variationControls.primarySpread : variationControls.secondarySpread;
    const offset = primary ? 0 : variationControls.secondaryOffset;
    const draws = spread === 0 && offset === 0 ? 0 : Math.ceil(predicted.frequency.length / 4) * 4;
    if (primary && managerRandom) {
      managerInitialization = managerRandom.nextVoice();
      if (record.epoch !== managerInitialization.ordinal) throw new Error('Manager initialization requires contiguous chronological voice starts');
      if(eventVelocity && JSON.stringify(managerInitialization)!==JSON.stringify(eventVelocity.events[record.epoch].initialization))
        throw new Error('Event velocity and source preparation manager streams differ');
    }
    initialRandomState = primary ? (managerInitialization?.voiceState ?? rewindExcitationRandom(record.randomState, draws)) : secondaryFrequencySeed(predicted.noteIndex);
    variation = varyExcitationFrequencies({frequency: predicted.frequency, columns: predicted.cols, spread, offset, randomState: initialRandomState});
    if (primary) {
      if (!Array.isArray(record.randomState) || record.randomState.length !== 4 || !record.randomState.every(x => Number.isInteger(x) && x >= 0 && x <= 0xffffffff))
        throw new Error('Complete post-jitter RNG comparison target required');
      const count = variation.randomState.filter((x, i) => x !== record.randomState[i]).length;
      randomStateMismatches += count;
      managerRandomStateChecks.push({epoch: record.epoch, predicted: variation.randomState, actual: record.randomState, mismatches: count});
    }
  }
  const arrays = {}, tableHashes = {}, columnHashes = {}, predictedSource = {};
  for (const [name, field] of [['frequency', 'frequency'], ['decay', 'decay'], ['amplitude', 'normalizedAmplitude'], ['phase', 'phase']]) {
    const actual = input.source[name], calculated = name === 'amplitude' && mix ? (neighbor?.amplitude ?? mix.amplitude)
      : name === 'phase' && neighbor ? neighbor.phase : name === 'decay' && decay ? decay
      : name === 'frequency' && variation ? variation.frequency : predicted[field];
    if (actual?.length !== calculated.length || !actual.every(Number.isFinite)) throw new Error('Complete native source arrays required');
    predictedSource[name] = Array.from(calculated);
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
  checks.push({epoch: record.epoch, mode: input.mode, rows: predicted.rows, columns: predicted.cols, arrays, predictedSource,
    neighbor: neighbor && {controls: neighborControls, amplitudeGain: neighbor.amplitudeGain, phaseDelta: neighbor.phaseDelta},
    decay: decayModel && {controls: decayControls, model: decayModel},
    frequencyVariation: variation && {controls: variationControls, initialRandomState, randomState: variation.randomState,
      randomDraws: variation.randomDraws, spacingCorrections: variation.spacingCorrections,
      managerInitialization, initialStateSource: input.mode === 0 ? (managerRandom ? 'manager reset and event draws' : 'rewound captured post-jitter RNG state') : 'note index LCG initialization'},
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
if (managerRandom && managerRandom.starts !== capture.starts) throw new Error('Incomplete manager random stream');
if(eventVelocity && velocityChecks.length!==15)throw new Error('Complete five-start/two-mode velocity coverage required');
const result = {passed: mismatches === 0 && randomStateMismatches === 0 && velocityMismatches === 0 && hardnessMismatches === 0, compatible: mismatches === 0 && randomStateMismatches === 0 && velocityMismatches === 0 && hardnessMismatches === 0, bindingAuditOnly: true,
  comparedValues, mismatches, captureSha256: sha(captureBytes), candidateSha256: sha(candidateBytes), checks, failures, stability, presetComparison,
  candidateAmplitudeNormalizationOriginallyObserved: false, correctionFitApplied: false,
  amplitudeMixComputedFromArchive: Boolean(mixBank), mixArchiveSha256,
  mixArchiveIndex: mixArchive?.[1], mixRuntimeCurveModeSupplied: mixBank ? 'linear-clamp' : undefined,
  mixRuntimeCurveModeNewlyObserved: false, interveningSourceTransformsFullyReconstructed: false,
  neighborControlsComputedFromArchive: Boolean(neighborEnabled), neighborSystemMathRequired: Boolean(neighborOracle),
  neighborNativeHypotfImplemented: Boolean(neighborEnabled), neighborNativeAtan2fImplemented: nativeNeighborMath,
  neighborOracleSha256: neighborOracle ? sha(fs.readFileSync(neighborOracle)) : undefined,
  neighborMathCalls: [...mathCalls.values()], decayPreparationReconstructed: false,
  decayPreparationComputedForSuppliedBranch: Boolean(decayPreset),
  decayControlsComputedFromArchive: Boolean(decayPreset), decayPresetSha256: decayPresetBytes ? sha(decayPresetBytes) : undefined,
  decayRuntimeBranchSupplied: decayPreset ? 'ordinary-host-zero' : undefined, decayRuntimeBranchNewlyObserved: false,
  frequencyVariationComputedFromArchive: Boolean(frequencySource), frequencyInstrumentModeSupplied: frequencySource ? 1 : undefined,
  frequencyInstrumentModeNewlyObserved: false, primaryInitialRandomStateIndependentlyProduced: Boolean(managerRandom),
  primaryRandomStateStillObserved: Boolean(frequencySource) && !managerRandom,
  managerConfigurationSeedSupplied: managerRandom ? 0 : undefined, managerEventBranchSupplied: managerRandom ? 'velocity-randomization-enabled' : undefined,
  managerRuntimeConditionsNewlyObserved: false, managerDraws: managerRandom?.draws,
  randomStateComparedWords: managerRandomStateChecks.length * 4, randomStateMismatches, managerRandomStateChecks,
  eventVelocityComputedFromMidiAndArchive:Boolean(eventVelocity), eventVelocitySource:eventVelocity?.source,
  eventVelocityTableSha256:eventVelocity?.tableSha256, eventVelocityPredictions:eventVelocity?.events,
  velocityComparedValues:velocityChecks.length, velocityMismatches,velocityChecks,
  eventVelocityRuntimeConditionsNewlyObserved:false,
  normalHardnessKnotsAndValuesComputedFromArchive:Boolean(archiveHardness),archiveHardnessSource:archiveHardness?.source,
  hardnessComparedValues:hardnessChecks.length*5,hardnessMismatches,hardnessChecks,
  hardnessRuntimeConditionsNewlyObserved:false,hardnessEditCurvesConsumed:false,
  compatibleWithCapturedContextOnly: true,
  substitutedIntoVoice: false, sameRunModelGenerationVerified: false, finalStereoVerified: false};
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({...result, failures: undefined, checks: undefined, stability: stability.map(({rows, ...r}) => r)}));
if (!result.passed) process.exitCode = 1;
