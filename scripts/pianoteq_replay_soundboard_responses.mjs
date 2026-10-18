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
if (runtime.records.every((record) => Number.isInteger(record.workerIndex))) {
  runtime.records.sort((a, b) => a.workerIndex - b.workerIndex);
  if (runtime.records.some((record, index) => record.workerIndex !== index)) {
    throw new Error('Worker indices must be complete and unique');
  }
} else if (runtime.converted?.length || runtime.trimmed?.length || runtime.filtered?.length || runtime.blended?.length) {
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
if (runtime.converted?.length || runtime.trimmed?.length || runtime.filtered?.length || runtime.blended?.length) {
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
if (runtime.trimmed?.length || runtime.filtered?.length || runtime.blended?.length || runtime.leading?.length) {
  if (!conversion) throw new Error('Conversion required before trimming');
  trim = trimSoundboardResponses(conversion.outputs, source.controls.tau);
  if (runtime.trimmed?.length) {
    if (runtime.trimmed.length !== conversion.outputs.length) throw new Error('Trimmed channel count differs');
    trimmedComparisons = trim.outputs.map((output, channel) =>
      compare(output, runtime.trimmed[channel], channel));
  }
}
if (runtime.filtered?.length) {
  if (!trim || runtime.filtered.length !== trim.outputs.length) throw new Error('Filtered channel count differs');
  filter = filterSoundboardResponses(trim.outputs, runtime.processing);
  filteredComparisons = filter.outputs.map((output, channel) =>
    compare(output, runtime.filtered[channel], channel));
}
if (runtime.blended?.length) {
  if (!filter || runtime.blended.length !== runtime.processing?.blend?.mainCount) throw new Error('Blended channel count differs');
  blend = blendSoundboardResponses(filter.outputs, runtime.processing.blend);
  blendedComparisons = blend.outputs.map((output, channel) =>
    compare(output, runtime.blended[channel], channel));
}
if (runtime.leading?.length) {
  if (!blend || runtime.leading.length !== blend.outputs.length) throw new Error('Leading-silence channel count differs');
  leading = processSoundboardLeadingSilence(blend.outputs, runtime.processing.blend.leadingSilenceMode);
  leadingComparisons = leading.outputs.map((output, channel) => compare(output, runtime.leading[channel], channel));
}
const cacheHash = crypto.createHash('sha256').update(new Uint8Array(result.blocks[0].buffer)).digest('hex');
const provenance = runtime.capturedSource;
const sameRunSource = Boolean(provenance &&
  provenance.config.sha256 === hashes[sourcePath] &&
  provenance.arrays.some((array) => array.label === 'va0' && array.rowsPath === source.matrixA) &&
  provenance.arrays.some((array) => array.label === 'vc0' && array.rowsPath === source.matrixC));
const allComparisons = [...comparisons, ...convertedComparisons, ...trimmedComparisons, ...filteredComparisons, ...blendedComparisons, ...leadingComparisons];
console.log(JSON.stringify({passed: allComparisons.every((c) => !c.mismatches),
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
  firstBlockHashMatchesCapture: runtime.records.every((r) => r.cache.sha256 === cacheHash),
  nativeBlockCacheUsedForPrediction: false, sourceMatricesAndObservationGroupsStillCaptured: true,
  sameRunCapturedSourceBound: sameRunSource,
  sourceMatricesConstructedFromModel: false, fullIrNodesGenerated: false}, null, 2));
if (allComparisons.some((c) => c.mismatches)) process.exitCode = 1;
