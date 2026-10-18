#!/usr/bin/env node
// Historical second-entry snapshots are diagnostic, not isolated return captures.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {applySoundboardOutputKernel} from '../dsp/soundboard-output-kernel.mjs';
import {runSoundboardBlock} from '../dsp/soundboard-block.mjs';
import {normalizeSoundboardRows} from '../dsp/soundboard-sparse.mjs';
import {soundboardScalarControls} from '../dsp/soundboard-scalar.mjs';
import {computeSoundboardResponses} from '../dsp/soundboard-response.mjs';

const [directory, sourceConfig, mode] = process.argv.slice(2);
if (mode !== undefined && (mode !== '--streamed-first-block' || !sourceConfig)) {
  throw new Error('Only --streamed-first-block with a source config is supported');
}
if (!directory) throw new Error('Usage: capture-directory');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (runtime.errors?.length) throw new Error('Capture has errors');
const c = runtime.capture;
const floats = (name) => {
  const bytes = fs.readFileSync(path.join(directory, name));
  if (bytes.length % 4) throw new Error('Unaligned float data');
  return new Float32Array(Uint8Array.from(bytes).buffer);
};
let cache;
let propagation;
const sourceHashes = {};
if (sourceConfig) {
  if (c.blockStart !== 0) throw new Error('Computed source currently supports first block only');
  const load = (filename) => {
    const bytes = fs.readFileSync(filename);
    sourceHashes[filename] = crypto.createHash('sha256').update(bytes).digest('hex');
    return JSON.parse(bytes);
  };
  const source = load(sourceConfig);
  const matrixA = normalizeSoundboardRows(load(source.matrixA).rows, 1500);
  const matrixC = normalizeSoundboardRows(load(source.matrixC).rows, 1500);
  if (!Array.isArray(source.excitation) || source.excitation.length !== 4 ||
      !source.excitation.every(Number.isFinite)) throw new Error('Four finite excitation samples required');
  propagation = {matrixA, matrixC,
    controls: soundboardScalarControls(source.controls),
    current: new Float32Array(1500), previous: new Float32Array(1500),
    excitation: Float32Array.from(source.excitation),
    excitationIndex: source.excitationIndex, weights: new Float32Array(65).fill(1),
  };
  cache = runSoundboardBlock(propagation).block;
} else {
  cache = floats('block-cache.bin');
}
if (cache.length !== 1500 * 65) throw new Error('Unexpected cache shape');
const blocks = Array.from({length: 1500}, (_, i) => cache.subarray(i * 65, (i + 1) * 65));
if (!Number.isInteger(c.outputLength) || c.outputLength < 65 || c.outputLength > 10000000) {
  throw new Error('Invalid output length');
}
const output = sourceConfig ? new Float32Array(c.outputLength) : floats('output-before.bin');
const expected = floats('output-after.bin');
if (!output.length || expected.length !== output.length || c.outputLength !== output.length) {
  throw new Error('Invalid output shape');
}
let cursor = 0;
let coefficient = 0;
let groups = 0;
const observationGroups = [];
while (cursor < c.entryInts.length) {
  const offset = c.entryInts[cursor++];
  const count = c.entryInts[cursor++];
  if (!Number.isInteger(count) || count < 0 || cursor + count > c.entryInts.length) {
    throw new Error('Invalid entry group');
  }
  const entries = Array.from({length: count}, () => ({
    stateIndex: c.entryInts[cursor++],
    a: c.coefficientsValues[coefficient++],
    b: c.coefficientsValues[coefficient++],
    c: c.coefficientsValues[coefficient++],
  }));
  const record = {offset, entries};
  observationGroups.push(record);
  if (!mode) applySoundboardOutputKernel(record, blocks, output, c.blockStart);
  groups++;
}
if (!groups) throw new Error('No entry groups');
if (mode) {
  const result = computeSoundboardResponses({propagation: {...propagation, steps: 64},
    observations: [{length: c.outputLength, groups: observationGroups}]});
  output.set(result.outputs[0]);
}
const actualBits = new Uint32Array(output.buffer);
const expectedBits = new Uint32Array(expected.buffer);
let mismatches = 0;
let maximumAbsoluteDifference = 0;
let firstDifference = null;
for (let i = 0; i < output.length; i++) {
  if (!Number.isFinite(output[i]) || !Number.isFinite(expected[i])) throw new Error('Non-finite output');
  if (actualBits[i] !== expectedBits[i]) {
    mismatches++;
    maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, Math.abs(output[i] - expected[i]));
    firstDifference ??= {index: i, actual: output[i], expected: expected[i]};
  }
}
console.log(JSON.stringify({groups, entries: coefficient / 3, compared: output.length,
  mismatches, maximumAbsoluteDifference, firstDifference,
  predictedOutputSha256: crypto.createHash('sha256').update(new Uint8Array(output.buffer)).digest('hex'),
  expectedOutputSha256: crypto.createHash('sha256').update(new Uint8Array(expected.buffer)).digest('hex'),
  stateBlockSha256: crypto.createHash('sha256').update(new Uint8Array(cache.buffer)).digest('hex'),
  stateBlockComputed: Boolean(sourceConfig), nativeCacheUsedForPrediction: !sourceConfig,
  streamedPropagationToResponse: Boolean(mode),
  outputInitializedToZero: Boolean(sourceConfig),
  sourceHashes, sourceMatricesAndObservationRecordsStillCaptured: true,
  snapshotBoundary: runtime.records?.[0]?.completedAt ?? 'unknown',
  isolatedNativeReturnVerified: false, matchedSnapshot: mismatches === 0}, null, 2));
if (mismatches) process.exitCode = 1;
