#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {computeSoundboardResponses} from '../dsp/soundboard-response.mjs';
import {normalizeSoundboardRows} from '../dsp/soundboard-sparse.mjs';
import {soundboardScalarControls} from '../dsp/soundboard-scalar.mjs';
import {soundboardIrWeights} from '../dsp/soundboard-ir-window.mjs';

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
const comparisons = result.outputs.map((output, channel) => {
  const expected = readDescriptor(runtime.records[channel].response);
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
});
const cacheHash = crypto.createHash('sha256').update(new Uint8Array(result.blocks[0].buffer)).digest('hex');
const provenance = runtime.capturedSource;
const sameRunSource = Boolean(provenance &&
  provenance.config.sha256 === hashes[sourcePath] &&
  provenance.arrays.some((array) => array.label === 'va0' && array.rowsPath === source.matrixA) &&
  provenance.arrays.some((array) => array.label === 'vc0' && array.rowsPath === source.matrixC));
console.log(JSON.stringify({passed: comparisons.every((c) => !c.mismatches),
  steps: controls.steps, blocks: result.blockCount, comparisons, sourceHashes: hashes,
  firstBlockHashMatchesCapture: runtime.records.every((r) => r.cache.sha256 === cacheHash),
  nativeBlockCacheUsedForPrediction: false, sourceMatricesAndObservationGroupsStillCaptured: true,
  sameRunCapturedSourceBound: sameRunSource,
  sourceMatricesConstructedFromModel: false, fullIrNodesGenerated: false}, null, 2));
if (comparisons.some((c) => c.mismatches)) process.exitCode = 1;
