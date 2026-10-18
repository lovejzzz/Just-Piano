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
const observations = runtime.records.map((record) => {
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
const controls = soundboardScalarControls(source.controls);
const result = computeSoundboardResponses({propagation: {
  matrixA: normalizeSoundboardRows(JSON.parse(read(source.matrixA)).rows, 1500),
  matrixC: normalizeSoundboardRows(JSON.parse(read(source.matrixC)).rows, 1500),
  controls, weights: soundboardIrWeights(controls.steps),
  excitation: Float32Array.from(source.excitation), excitationIndex: source.excitationIndex,
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
  conversion = convertSoundboardResponses(result.outputs, {...source.conversion,
    h: source.controls.h, tau: source.controls.tau,
    logicalLength: controls.steps + lastDelay + 1});
  if (runtime.converted?.length) {
    if (runtime.converted.length !== result.outputs.length) throw new Error('Converted channel count differs');
    convertedComparisons = conversion.outputs.map((output, channel) =>
      compare(output, runtime.converted[channel], channel));
  }
}
if (needTrim) {
  if (!conversion) throw new Error('Conversion required before trimming');
  trim = trimSoundboardResponses(conversion.outputs, source.controls.tau);
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
      {tau: source.controls.tau, amount, width, flags: flag});
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
const cacheHash = crypto.createHash('sha256').update(new Uint8Array(result.blocks[0].buffer)).digest('hex');
const provenance = runtime.capturedSource;
const sameRunSource = Boolean(provenance &&
  provenance.config.sha256 === hashes[sourcePath] &&
  provenance.arrays.some((array) => array.label === 'va0' && array.rowsPath === source.matrixA) &&
  provenance.arrays.some((array) => array.label === 'vc0' && array.rowsPath === source.matrixC));
const allComparisons = [...comparisons, ...convertedComparisons, ...trimmedComparisons, ...filteredComparisons, ...blendedComparisons, ...leadingComparisons, ...magnitudeComparisons, ...whiteningComparisons, ...curveGainComparisons, ...inverseInputComparisons, ...inverseOutputComparisons, ...reconstructionComparisons, ...shapedComparisons, ...normalizedComparisons];
const controlMismatchCount = spectralControlMismatches.length + reconstructionControlMismatches.length + normalizationControlMismatches.length;
console.log(JSON.stringify({passed: allComparisons.every((c) => !c.mismatches) && !controlMismatchCount,
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
  spectralPrefixComputed: spectralPrefixes.length > 0,
  curveGainControlsFromShapingCapture: curveGainComparisons.length > 0,
  spectralNativeTargetsUsedForPrediction: false,
  shapingComputed: reconstructed.length > 0,
  firstBlockHashMatchesCapture: runtime.records.every((r) => r.cache?.sha256) ?
    runtime.records.every((r) => r.cache.sha256 === cacheHash) : null,
  nativeBlockCacheUsedForPrediction: false, sourceMatricesAndObservationGroupsStillCaptured: true,
  sameRunCapturedSourceBound: sameRunSource,
  sourceMatricesConstructedFromModel: false, fullIrNodesGenerated: false}, null, 2));
if (allComparisons.some((c) => c.mismatches) || controlMismatchCount) process.exitCode = 1;
