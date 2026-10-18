#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {computeSoundboardResponses} from '../dsp/soundboard-response.mjs';
import {normalizeSoundboardRows} from '../dsp/soundboard-sparse.mjs';
import {soundboardScalarControls} from '../dsp/soundboard-scalar.mjs';
import {soundboardIrWeights} from '../dsp/soundboard-ir-window.mjs';
import {convertSoundboardResponses} from '../dsp/soundboard-response-conversion.mjs';
import {trimSoundboardResponses} from '../dsp/soundboard-response-trim.mjs';
import {filterSoundboardResponses} from '../dsp/soundboard-response-filter.mjs';
import {blendSoundboardResponses} from '../dsp/soundboard-response-blend.mjs';
import {processSoundboardLeadingSilence} from '../dsp/soundboard-leading-silence.mjs';
import {prepareSoundboardSpectralPrefix} from '../dsp/soundboard-spectral-prefix.mjs';
import {soundboardCurveGain} from '../dsp/soundboard-curve-gain.mjs';
import {computeSoundboardInverseSpectrum} from '../dsp/soundboard-inverse-spectrum.mjs';
import {reconstructSoundboardTime} from '../dsp/soundboard-time-reconstruction.mjs';
import {normalizeSoundboardResponses} from '../dsp/soundboard-response-normalization.mjs';
import {createSoundboardResamplingPlan, resampleSoundboardResponse} from '../dsp/soundboard-resampling.mjs';
import {finalizeSoundboardDispatch} from '../dsp/soundboard-dispatch-output.mjs';
import {initializeSoundboardFromConfig} from '../dsp/soundboard-initialization.mjs';
import {constructSoundboardMatrices} from '../dsp/soundboard-matrix-construction.mjs';
import {constructSoundboardObservationGroups} from '../dsp/soundboard-observation-groups.mjs';
import {constructSoundboardReceiverGeometry} from '../dsp/soundboard-receiver-geometry.mjs';

const [sourcePath, captureDirectory] = process.argv.slice(2);
if (!captureDirectory) throw new Error('Usage: source-config.json capture-directory');
const hashes = {};
const read = (filename) => {
  const bytes = fs.readFileSync(filename);
  hashes[filename] = crypto.createHash('sha256').update(bytes).digest('hex');
  return bytes;
};
const source = JSON.parse(read(sourcePath));
const runtime = JSON.parse(read(path.join(captureDirectory, 'runtime.json')));
if (!runtime.completed || runtime.errors.length || !runtime.records.length) {
  throw new Error('Completed error-free response capture required');
}
if (runtime.runStatus && (!runtime.runStatus.terminal || runtime.runStatus.exitStatus !== 0)) {
  throw new Error('Capture process has not exited successfully');
}
const leadingTargets = runtime.leading?.length ? runtime.leading : runtime.shaping?.input ?? [];
const needLeading = leadingTargets.length > 0;
const needBlend = Boolean(runtime.blended?.length || needLeading);
const needFilter = Boolean(runtime.filtered?.length || needBlend);
const needTrim = Boolean(runtime.trimmed?.length || needFilter);
const needConversion = Boolean(runtime.converted?.length || needTrim);
if (runtime.records.every((record) => Number.isInteger(record.workerIndex))) {
  runtime.records.sort((a, b) => a.workerIndex - b.workerIndex);
  if (runtime.records.some((record, index) => record.workerIndex !== index)) {
    throw new Error('Worker indices must be complete and unique');
  }
} else if (needConversion) {
  throw new Error('Explicit worker indices required for converted channel comparison');
}
const readDescriptor = (descriptor) => {
  if (!descriptor || path.basename(descriptor.file) !== descriptor.file) throw new Error('Invalid descriptor');
  const bytes = read(path.join(captureDirectory, descriptor.file));
  if (bytes.length !== descriptor.bytes || hashes[path.join(captureDirectory, descriptor.file)] !== descriptor.sha256) {
    throw new Error('Captured descriptor digest differs');
  }
  return bytes;
};
const capturedObservations = runtime.records.map((record) => {
  const ints = readDescriptor(record.groupData);
  const coeff = readDescriptor(record.coefficients);
  const groups = [];
  let cursor = 0, coefficient = 0;
  while (cursor < ints.length) {
    if (cursor + 8 > ints.length) throw new Error('Truncated group header');
    const offset = ints.readInt32LE(cursor);
    const count = ints.readUInt32LE(cursor + 4);
    cursor += 8;
    if (cursor + count * 4 > ints.length || coefficient + count * 12 > coeff.length) {
      throw new Error('Truncated observation entries');
    }
    const entries = Array.from({length: count}, () => {
      const entry = {stateIndex: ints.readUInt32LE(cursor), a: coeff.readFloatLE(coefficient),
        b: coeff.readFloatLE(coefficient + 4), c: coeff.readFloatLE(coefficient + 8)};
      cursor += 4; coefficient += 12;
      return entry;
    });
    groups.push({offset, entries});
  }
  if (coefficient !== coeff.length) throw new Error('Unconsumed observation coefficients');
  return {length: record.length, groups};
});
let initialization = null;
const initializationControlMismatches = [];
let propagationControls = source.controls, conversionControls = source.conversion;
let excitation = Float32Array.from(source.excitation), excitationIndex = source.excitationIndex, stateSize = 1500;
if (runtime.initializationInputs) {
  const bridge = new Float32Array(Uint8Array.from(readDescriptor(runtime.initializationInputs.bridge)).buffer);
  initialization = initializeSoundboardFromConfig(readDescriptor(runtime.initializationInputs.config), bridge);
  propagationControls = initialization.propagationControls; conversionControls = initialization.conversion;
  excitation = initialization.excitation.output; excitationIndex = initialization.grid.excitationIndex;
  stateSize = initialization.grid.size;
  for (const [name, actual] of Object.entries(propagationControls)) {
    if (!Object.is(actual, source.controls[name])) initializationControlMismatches.push({name, actual, expected: source.controls[name]});
  }
  for (const [name, actual] of Object.entries(conversionControls)) {
    if (!Object.is(actual, source.conversion[name])) initializationControlMismatches.push({name: `conversion.${name}`, actual, expected: source.conversion[name]});
  }
  if (excitationIndex !== source.excitationIndex || source.excitation.length !== excitation.length ||
      excitation.some((v, i) => !Object.is(v, source.excitation[i]))) {
    initializationControlMismatches.push({name: 'excitation', actualIndex: excitationIndex, expectedIndex: source.excitationIndex});
  }
}
const controls = soundboardScalarControls(propagationControls);
const capturedMatrices = {
  matrixA: normalizeSoundboardRows(JSON.parse(read(source.matrixA)).rows, stateSize),
  matrixC: normalizeSoundboardRows(JSON.parse(read(source.matrixC)).rows, stateSize),
};
const constructedMatrices = initialization && constructSoundboardMatrices(initialization.grid, initialization.matrixControls);
const floats = (d) => new Float32Array(Uint8Array.from(readDescriptor(d)).buffer);
let constructedReceivers = null;
const receiverComparisons = [];
if (runtime.receiverConstructionInputs) {
  const input = runtime.receiverConstructionInputs, target = runtime.observationConstructionInputs;
  if (!initialization || !constructedMatrices || !target || input.state !== runtime.capturedSource?.state ||
      input.state !== target.state) throw new Error('Same-run receiver configuration required');
  constructedReceivers = constructSoundboardReceiverGeometry({grid: initialization.grid, shape: constructedMatrices.shape,
    ...initialization.receiverControls, primary: input.primary.map(floats), offsets: input.offsets.map(floats),
    parents: new Uint32Array(Uint8Array.from(readDescriptor(input.parents)).buffer),
    offsetScale: input.offsetScale, mirror: input.mirror});
  if (constructedReceivers.geometry.length !== target.geometry.length) throw new Error('Final receiver count differs');
  constructedReceivers.geometry.forEach((g, i) => {
    const oracle = target.geometry[i], coordinates = floats(oracle.coordinates);
    let coordinateMismatches = 0, metadataMismatches = 0;
    for (let j = 0; j < 3; j++) coordinateMismatches += Number(!Object.is(g.coordinates[j], coordinates[j]));
    for (const key of ['amplitude', 'identity', 'channel', 'kind']) metadataMismatches += Number(!Object.is(g[key], oracle[key]));
    receiverComparisons.push({receiver: i, coordinateMismatches, metadataMismatches,
      predictedSha256: crypto.createHash('sha256').update(new Uint8Array(g.coordinates.buffer)).digest('hex')});
  });
}
const receiverMismatchCount = receiverComparisons.reduce((sum, c) => sum + c.coordinateMismatches + c.metadataMismatches, 0);
let constructedObservations = null;
if (runtime.observationConstructionInputs) {
  const input = runtime.observationConstructionInputs;
  if (!initialization || input.state !== runtime.capturedSource?.state || ![0, 1].includes(input.phaseMode)) {
    throw new Error('Same-run initialized observation inputs required');
  }
  constructedObservations = constructSoundboardObservationGroups({grid: initialization.grid,
    geometry: constructedReceivers?.geometry ?? input.geometry.map((g) => ({...g, coordinates: floats(g.coordinates)})), gains: floats(input.gains),
    ...initialization.observationControls, steps: controls.steps, phaseMode: Boolean(input.phaseMode)});
}
const observations = constructedObservations?.observations ?? capturedObservations;
function encodeObservation(observation) {
  const words = [], coefficients = [];
  for (const group of observation.groups) {
    words.push(group.offset, group.entries.length);
    for (const entry of group.entries) {
      words.push(entry.stateIndex); coefficients.push(entry.a, entry.b, entry.c);
    }
  }
  return [Buffer.from(Uint32Array.from(words).buffer), Buffer.from(Float32Array.from(coefficients).buffer)];
}
if (observations.length !== capturedObservations.length) throw new Error('Observation channel count differs');
const observationComparisons = constructedObservations ? observations.map((observation, channel) => {
  const target = capturedObservations[channel], expected = encodeObservation(target), actual = encodeObservation(observation);
  const arrays = actual.map((bytes, i) => {
    let mismatches = Number(bytes.length !== expected[i].length);
    for (let j = 0; j < Math.min(bytes.length, expected[i].length); j += 4) {
      if (bytes.readUInt32LE(j) !== expected[i].readUInt32LE(j)) mismatches++;
    }
    return {compared: bytes.length / 4, mismatches,
      predictedSha256: crypto.createHash('sha256').update(bytes).digest('hex')};
  });
  return {channel, lengthMatches: observation.length === target.length, arrays};
}) : [];
const observationMismatchCount = observationComparisons.reduce((sum, c) => sum + Number(!c.lengthMatches) +
  c.arrays.reduce((n, a) => n + a.mismatches, 0), 0);
const matrixComparisons = constructedMatrices ? ['matrixA', 'matrixC'].map((name) => {
  const rows = constructedMatrices[name], target = capturedMatrices[name];
  let structureMismatches = 0, coefficientMismatches = 0, compared = 0;
  const words = [rows.length], view = new DataView(new ArrayBuffer(4));
  rows.forEach((row, i) => {
    if (row.length !== target[i].length) structureMismatches++;
    words.push(row.length);
    row.forEach((entry, j) => {
      const oracle = target[i][j];
      view.setFloat32(0, entry.value, true);
      words.push(entry.index, view.getUint32(0, true)); compared++;
      if (!oracle || oracle.index !== entry.index) structureMismatches++;
      if (oracle && !Object.is(entry.value, oracle.value)) coefficientMismatches++;
    });
  });
  return {name, compared, structureMismatches, coefficientMismatches,
    predictedSha256: crypto.createHash('sha256').update(new Uint8Array(Uint32Array.from(words).buffer)).digest('hex')};
}) : [];
const matrixMismatchCount = matrixComparisons.reduce((sum, m) => sum + m.structureMismatches + m.coefficientMismatches, 0);
const result = computeSoundboardResponses({propagation: {
  matrixA: (constructedMatrices ?? capturedMatrices).matrixA,
  matrixC: (constructedMatrices ?? capturedMatrices).matrixC,
  controls, weights: soundboardIrWeights(controls.steps),
  excitation, excitationIndex,
  captureBlockStarts: [0],
}, observations});
function compare(output, descriptor, channel) {
  const expected = readDescriptor(descriptor);
  if (expected.length !== output.byteLength) throw new Error('Response length differs');
  const actual = new Uint32Array(output.buffer);
  let mismatches = 0, maximum = 0, first = null;
  for (let i = 0; i < actual.length; i++) {
    const target = expected.readFloatLE(i * 4);
    if (!Number.isFinite(target)) throw new Error('Non-finite target');
    if (actual[i] !== expected.readUInt32LE(i * 4)) {
      mismatches++; maximum = Math.max(maximum, Math.abs(output[i] - target));
      first ??= {index: i, actual: output[i], expected: target};
    }
  }
  return {channel, compared: actual.length, mismatches, maximum, first,
    predictedSha256: crypto.createHash('sha256').update(new Uint8Array(output.buffer)).digest('hex')};
}
const comparisons = result.outputs.map((output, channel) =>
  compare(output, runtime.records[channel].response, channel));
let conversion = null;
let convertedComparisons = [];
let trim = null;
let trimmedComparisons = [];
let filter = null;
let filteredComparisons = [];
let blend = null;
let blendedComparisons = [];
let leading = null;
let leadingComparisons = [];
if (needConversion) {
  const lastDelay = Math.max(...observations.flatMap((observation) =>
    observation.groups.map((group) => group.offset)));
  conversion = convertSoundboardResponses(result.outputs, {...conversionControls,
    h: propagationControls.h, tau: propagationControls.tau,
    logicalLength: controls.steps + lastDelay + 1});
  if (runtime.converted?.length) {
    if (runtime.converted.length !== result.outputs.length) throw new Error('Converted channel count differs');
    convertedComparisons = conversion.outputs.map((output, channel) =>
      compare(output, runtime.converted[channel], channel));
  }
}
if (needTrim) {
  if (!conversion) throw new Error('Conversion required before trimming');
  trim = trimSoundboardResponses(conversion.outputs, propagationControls.tau);
  if (runtime.trimmed?.length) {
    if (runtime.trimmed.length !== conversion.outputs.length) throw new Error('Trimmed channel count differs');
    trimmedComparisons = trim.outputs.map((output, channel) =>
      compare(output, runtime.trimmed[channel], channel));
  }
}
if (needFilter) {
  if (!trim) throw new Error('Trimmed responses required before filtering');
  filter = filterSoundboardResponses(trim.outputs, runtime.processing);
  if (runtime.filtered?.length) {
    if (runtime.filtered.length !== trim.outputs.length) throw new Error('Filtered channel count differs');
    filteredComparisons = filter.outputs.map((output, channel) =>
      compare(output, runtime.filtered[channel], channel));
  }
}
if (needBlend) {
  if (!filter) throw new Error('Filtered responses required before blending');
  blend = blendSoundboardResponses(filter.outputs, runtime.processing.blend);
  if (runtime.blended?.length) {
    if (runtime.blended.length !== runtime.processing?.blend?.mainCount) throw new Error('Blended channel count differs');
    blendedComparisons = blend.outputs.map((output, channel) =>
      compare(output, runtime.blended[channel], channel));
  }
}
if (needLeading) {
  if (!blend || leadingTargets.length !== blend.outputs.length) throw new Error('Leading-silence channel count differs');
  leading = processSoundboardLeadingSilence(blend.outputs, runtime.processing.blend.leadingSilenceMode);
  leadingComparisons = leading.outputs.map((output, channel) => compare(output, leadingTargets[channel], channel));
}
const magnitudeComparisons = [], whiteningComparisons = [], spectralControlMismatches = [];
const spectralPrefixes = [], curveGainComparisons = [];
const inverseInputComparisons = [], inverseOutputComparisons = [], computedCurveGains = [];
const inverseResults = [], reconstructionComparisons = [], reconstructionControlMismatches = [];
const reconstructed = [], shapedComparisons = [], normalizedComparisons = [], normalizationControlMismatches = [];
const needReconstruction = Boolean(runtime.reconstructionRecords?.length || runtime.shaped?.length);
const needInverse = Boolean(runtime.fftRecords?.length || needReconstruction);
if (runtime.whiteningRecords?.length || runtime.curveGainRecords?.length || needInverse) {
  if (!leading) throw new Error('Generated leading responses required');
  if (runtime.whiteningRecords?.length && (runtime.whiteningErrors?.length || runtime.whiteningPending ||
      runtime.whiteningRecords.length !== leading.outputs.length)) throw new Error('Complete whitening chain required');
  const amounts = readDescriptor(runtime.shaping.floatVector);
  const flags = readDescriptor(runtime.shaping.intVector);
  if (amounts.length !== leading.outputs.length * 4 || flags.length !== amounts.length) {
    throw new Error('Shaping control vector length differs');
  }
  for (let channel = 0; channel < leading.outputs.length; channel++) {
    const amount = amounts.readFloatLE(channel * 4), flag = Number(flags.readUInt32LE(channel * 4) !== 0);
    const width = runtime.shaping.scalars[1];
    const prefix = prepareSoundboardSpectralPrefix(leading.outputs[channel],
      {tau: propagationControls.tau, amount, width, flags: flag});
    spectralPrefixes.push(prefix);
    if (!runtime.whiteningRecords?.length) continue;
    const target = runtime.whiteningRecords[channel];
    const predictedParameters = [amount, width, prefix.binSpacing];
    if (target.number !== channel || target.length !== prefix.magnitude.length || target.flags !== flag ||
        predictedParameters.some((value, i) => !Object.is(value, target.parameters[i]))) {
      spectralControlMismatches.push({channel, predictedParameters, predictedFlags: flag,
        observedParameters: target.parameters, observedFlags: target.flags});
    }
    magnitudeComparisons.push(compare(prefix.magnitude, target.input, channel));
    whiteningComparisons.push(compare(prefix.whitening.output, target.output, channel));
  }
}
if (runtime.curveGainRecords?.length || needInverse) {
  if (runtime.curveGainRecords?.length && (runtime.curveGainErrors?.length || runtime.curveGainPending ||
      runtime.curveGainRecords.length !== spectralPrefixes.length * 2)) throw new Error('Complete curve gain chain required');
  const blend = readDescriptor(runtime.shaping.blendVector);
  if (blend.length !== spectralPrefixes.length * 4) throw new Error('Curve mix vector differs');
  for (let channel = 0; channel < spectralPrefixes.length; channel++) {
    computedCurveGains[channel] = [];
    for (let kind = 0; kind < 2; kind++) {
      const curve = kind ? runtime.shaping.channelCurveObjects[channel] : runtime.shaping.globalCurve;
      const header = readDescriptor(curve.header);
      if (header.length !== 80) throw new Error('Curve header shape differs');
      const floats = (offset) => {
        const range = curve.candidateRanges.find((r) => r.offset === offset);
        if (!range) throw new Error('Required curve vector missing');
        return new Float32Array(Uint8Array.from(readDescriptor(range.data)).buffer);
      };
      const width = kind ? 40 : runtime.shaping.scalars[2];
      const mix = kind ? 0 : blend.readFloatLE(channel * 4);
      const parameters = [width, mix, spectralPrefixes[channel].binSpacing];
      const predicted = soundboardCurveGain({x: floats(24), y: floats(48), dimensions: header.readUInt32LE(72),
        mode: header[77], logX: header[76]}, {length: spectralPrefixes[channel].magnitude.length,
        smoothingWidth: width, mix, binSpacing: parameters[2]});
      computedCurveGains[channel].push(predicted.output);
      if (!runtime.curveGainRecords?.length) continue;
      const record = runtime.curveGainRecords[channel * 2 + kind];
      if (record.number !== channel * 2 + kind || record.parameters?.length !== 3 ||
          parameters.some((v, i) => !Object.is(v, record.parameters[i]))) {
        spectralControlMismatches.push({channel, curveKind: kind, predictedParameters: parameters,
          observedParameters: record.parameters});
      }
      curveGainComparisons.push({...compare(predicted.output, record.output, channel), curveKind: kind});
    }
  }
}
if (needInverse) {
  if (runtime.fftRecords?.length && (runtime.fftErrors?.length || runtime.fftPending || runtime.fftRecords.length !== spectralPrefixes.length)) {
    throw new Error('Complete inverse-only FFT chain required');
  }
  for (let channel = 0; channel < spectralPrefixes.length; channel++) {
    const predicted = computeSoundboardInverseSpectrum(spectralPrefixes[channel],
      {power: runtime.shaping.scalars[0], globalGain: computedCurveGains[channel][0],
        channelGain: computedCurveGains[channel][1]});
    inverseResults.push(predicted);
    if (!runtime.fftRecords?.length) continue;
    const record = runtime.fftRecords[channel];
    if (record.number !== channel || record.direction !== 1 || record.length !== 16384 ||
        record.returnAddress !== 0x10069c834) throw new Error('Inverse FFT profile differs');
    inverseInputComparisons.push(compare(predicted.inverseInput, record.input, channel));
    inverseOutputComparisons.push(compare(predicted.inverseOutput, record.output, channel));
  }
}
if (needReconstruction) {
  if (runtime.reconstructionRecords?.length && (runtime.reconstructionErrors?.length || runtime.reconstructionPending ||
      runtime.reconstructionRecords.length !== inverseResults.length)) throw new Error('Complete reconstruction capture required');
  for (let channel = 0; channel < inverseResults.length; channel++) {
    const prefix = spectralPrefixes[channel];
    const predicted = reconstructSoundboardTime(leading.outputs[channel], prefix, inverseResults[channel]);
    reconstructed.push(predicted.output);
    if (!runtime.reconstructionRecords?.length) continue;
    const record = runtime.reconstructionRecords[channel];
    if (record.number !== channel || record.start !== prefix.start || record.end !== prefix.end ||
        record.span !== prefix.end - prefix.start || record.headTailSums?.length !== 4 ||
        predicted.headTailSums.some((v, i) => !Object.is(v, record.headTailSums[i]))) {
      reconstructionControlMismatches.push({channel, predictedSums: predicted.headTailSums,
        observedSums: record.headTailSums});
    }
    for (const [stage, target] of [['original', record.original], ['scaledInverse', record.scaledInverse],
                                  ['weights', record.weights], ['core', record.output]]) {
      reconstructionComparisons.push({...compare(predicted[stage], target, channel), stage});
    }
  }
}
let normalization = null;
if (runtime.shaped?.length) {
  if (runtime.shaped.length !== reconstructed.length) throw new Error('Shaped channel count differs');
  for (let channel = 0; channel < reconstructed.length; channel++) {
    shapedComparisons.push(compare(reconstructed[channel], runtime.shaped[channel], channel));
  }
}
if (runtime.normalized?.length) {
  if (runtime.normalized.length !== reconstructed.length || runtime.normalization?.length !== 3 ||
      runtime.normalizedHeaders?.length !== reconstructed.length) throw new Error('Complete normalization capture required');
  const [gain, sampleRate, impulseMix] = runtime.normalization;
  normalization = normalizeSoundboardResponses(reconstructed, {gain, sampleRate, impulseMix});
  const words = new Uint32Array(Float32Array.from(normalization.normalizations).buffer);
  for (let channel = 0; channel < normalization.outputs.length; channel++) {
    normalizedComparisons.push(compare(normalization.outputs[channel], runtime.normalized[channel], channel));
    if (words[channel] !== runtime.normalizedHeaders[channel].normalizationValueBits) {
      normalizationControlMismatches.push({channel, actualBits: words[channel],
        expectedBits: runtime.normalizedHeaders[channel].normalizationValueBits});
    }
  }
}
const resampledComparisons = [];
const computedResampled = [], dispatchComparisons = [];
let resamplingPlan = null;
if (runtime.resampled?.length || runtime.dispatchOutputs?.length) {
  if (!normalization || runtime.resamplingPending || runtime.resampling?.length !== 2 ||
      (runtime.resampled?.length && (runtime.resampled.length !== normalization.outputs.length ||
      runtime.resampledHeaders?.length !== normalization.outputs.length))) throw new Error('Complete resampled chain required');
  const [outputRate, inputRate] = runtime.resampling;
  if (![outputRate, inputRate].every((v) => Number.isFinite(v) && v > 0)) throw new Error('Invalid resampling rates');
  resamplingPlan = createSoundboardResamplingPlan(Math.fround(outputRate / inputRate), 10);
  for (let channel = 0; channel < normalization.outputs.length; channel++) {
    const result = resampleSoundboardResponse(normalization.outputs[channel], resamplingPlan);
    computedResampled.push(result.output);
    if (!runtime.resampled?.length) continue;
    if (runtime.resampledHeaders[channel].length !== result.output.length) throw new Error('Resampled header length differs');
    resampledComparisons.push({...compare(result.output, runtime.resampled[channel], channel), frames: result.frames});
  }
}
let dispatch = null;
if (runtime.dispatchOutputs?.length) {
  if (runtime.dispatchOutputs.length !== computedResampled.length ||
      runtime.dispatchHeaders?.length !== computedResampled.length) throw new Error('Complete dispatcher targets required');
  dispatch = finalizeSoundboardDispatch(computedResampled, runtime.resampling[0]);
  const normalizations = new Uint32Array(Float32Array.from(normalization.normalizations).buffer);
  for (let channel = 0; channel < dispatch.outputs.length; channel++) {
    if (runtime.dispatchHeaders[channel].length !== dispatch.outputs[channel].length) throw new Error('Dispatcher length differs');
    dispatchComparisons.push(compare(dispatch.outputs[channel], runtime.dispatchOutputs[channel], channel));
    if (normalizations[channel] !== runtime.dispatchHeaders[channel].normalizationValueBits) {
      normalizationControlMismatches.push({channel, stage: 'dispatcher', actualBits: normalizations[channel],
        expectedBits: runtime.dispatchHeaders[channel].normalizationValueBits});
    }
  }
}
const cacheHash = crypto.createHash('sha256').update(new Uint8Array(result.blocks[0].buffer)).digest('hex');
const provenance = runtime.capturedSource;
const sameRunSource = Boolean(provenance &&
  provenance.config.sha256 === hashes[sourcePath] &&
  provenance.arrays.some((array) => array.label === 'va0' && array.rowsPath === source.matrixA) &&
  provenance.arrays.some((array) => array.label === 'vc0' && array.rowsPath === source.matrixC));
const allComparisons = [...comparisons, ...convertedComparisons, ...trimmedComparisons, ...filteredComparisons, ...blendedComparisons, ...leadingComparisons, ...magnitudeComparisons, ...whiteningComparisons, ...curveGainComparisons, ...inverseInputComparisons, ...inverseOutputComparisons, ...reconstructionComparisons, ...shapedComparisons, ...normalizedComparisons, ...resampledComparisons, ...dispatchComparisons];
const controlMismatchCount = spectralControlMismatches.length + reconstructionControlMismatches.length + normalizationControlMismatches.length + initializationControlMismatches.length;
console.log(JSON.stringify({passed: allComparisons.every((c) => !c.mismatches) && !controlMismatchCount && !matrixMismatchCount && !observationMismatchCount && !receiverMismatchCount,
  receiverComparisons, receiverGeometryComputed: Boolean(constructedReceivers),
  finalReceiverCoordinatesUsedForPrediction: !constructedReceivers,
  primaryReceiverConfigurationStillCaptured: Boolean(constructedReceivers),
  observationComparisons, observationGroupsConstructedFromGeometry: Boolean(constructedObservations),
  sourceObservationGroupsUsedForPrediction: !constructedObservations,
  observationGeometryStillCaptured: Boolean(constructedObservations) && !constructedReceivers,
  matrixComparisons, sourceMatricesConstructedFromConfiguration: Boolean(constructedMatrices),
  sourceMatricesUsedForPrediction: !constructedMatrices,
  matrixSolverIterations: constructedMatrices?.solve.iterations ?? null,
  initializationControlMismatches, initializationComputed: Boolean(initialization),
  initializationConfigurationStillCaptured: Boolean(initialization),
  sourceExcitationUsedForPrediction: !initialization, sourceGridScalarsUsedForPrediction: !initialization,
  steps: controls.steps, blocks: result.blockCount, comparisons, sourceHashes: hashes,
  convertedComparisons, conversionScale: conversion?.scale ?? null,
  conversionMode: conversion?.mode ?? null,
  conversionNativeTargetVerified: convertedComparisons.length > 0 && convertedComparisons.every((c) => !c.mismatches),
  trimmedComparisons, trimLength: trim?.length ?? null, taperCount: trim?.taperCount ?? null,
  trimNativeTargetVerified: trimmedComparisons.length > 0 && trimmedComparisons.every((c) => !c.mismatches),
  filteredComparisons,
  filterCoefficients: filter && {selectedCutoff: filter.selectedCutoff, tangent: filter.tangent,
    feedback: filter.feedback, feed: filter.feed, adjustmentScale: filter.adjustmentScale,
    referenceIndices: filter.referenceIndices},
  filterNativeTargetVerified: filteredComparisons.length > 0 && filteredComparisons.every((c) => !c.mismatches),
  filterControlsAndChannelMetadataFromCapture: Boolean(filter),
  blendedComparisons, blendCoefficientsFromCapture: Boolean(blend),
  blendNativeTargetVerified: blendedComparisons.length > 0 && blendedComparisons.every((c) => !c.mismatches),
  leadingComparisons, leadingShifts: leading?.shifts ?? null,
  leadingMode: leading?.mode ?? null,
  leadingNativeTargetVerified: leadingComparisons.length > 0 && leadingComparisons.every((c) => !c.mismatches),
  magnitudeComparisons, whiteningComparisons, curveGainComparisons, spectralControlMismatches,
  inverseInputComparisons, inverseOutputComparisons,
  inverseSpectrumComputed: inverseResults.length > 0,
  reconstructionComparisons, reconstructionControlMismatches,
  timeReconstructionComputed: reconstructed.length > 0,
  shapedComparisons, normalizedComparisons, normalizationControlMismatches,
  normalizationComputed: Boolean(normalization), normalizationControlsStillCaptured: Boolean(normalization),
  resampledComparisons, resamplingComputed: Boolean(resamplingPlan),
  dispatchComparisons, dispatchComputed: Boolean(dispatch), dispatchScale: dispatch?.scale ?? null,
  resamplingControlsStillCaptured: Boolean(resamplingPlan),
  resamplingPlan: resamplingPlan && {numerator: resamplingPlan.numerator, denominator: resamplingPlan.denominator,
    filterLength: resamplingPlan.filterLength, taps: resamplingPlan.taps,
    coefficientsComputed: true, capturedCoefficientsUsedForPrediction: false},
  spectralPrefixComputed: spectralPrefixes.length > 0,
  curveGainControlsFromShapingCapture: curveGainComparisons.length > 0,
  spectralNativeTargetsUsedForPrediction: false,
  shapingComputed: reconstructed.length > 0,
  firstBlockHashMatchesCapture: runtime.records.every((r) => r.cache?.sha256) ?
    runtime.records.every((r) => r.cache.sha256 === cacheHash) : null,
  nativeBlockCacheUsedForPrediction: false, observationGroupsStillCaptured: !constructedObservations,
  sameRunCapturedSourceBound: sameRunSource,
  sourceMatricesConstructedFromModel: false, fullIrNodesGenerated: false}, null, 2));
if (allComparisons.some((c) => c.mismatches) || controlMismatchCount || matrixMismatchCount || observationMismatchCount || receiverMismatchCount) process.exitCode = 1;
