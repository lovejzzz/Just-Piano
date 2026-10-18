#!/usr/bin/env node
// Isolated normalizer validation: shaping inputs remain explicitly observed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {normalizeSoundboardResponses} from '../dsp/soundboard-response-normalization.mjs';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: capture-directory');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (!runtime.completed || runtime.errors.length || !runtime.runStatus?.terminal || runtime.runStatus.exitStatus !== 0 ||
    !runtime.shaped?.length || runtime.shaped.length !== runtime.normalized?.length ||
    runtime.normalization?.length !== 3) throw new Error('Completed normalization capture required');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (descriptor) => {
  if (path.basename(descriptor.file) !== descriptor.file) throw new Error('Invalid descriptor');
  const bytes = fs.readFileSync(path.join(directory, descriptor.file));
  if (bytes.length !== descriptor.bytes || bytes.length % 4 || digest(bytes) !== descriptor.sha256) {
    throw new Error('Capture descriptor differs');
  }
  return new Float32Array(Uint8Array.from(bytes).buffer);
};
const [gain, sampleRate, impulseMix] = runtime.normalization;
const result = normalizeSoundboardResponses(runtime.shaped.map(read), {gain, sampleRate, impulseMix});
let scalarMismatches = 0;
const comparisons = result.outputs.map((output, channel) => {
  const expected = read(runtime.normalized[channel]);
  if (expected.length !== output.length) throw new Error('Normalization shape differs');
  const actualBits = new Uint32Array(output.buffer), expectedBits = new Uint32Array(expected.buffer);
  let mismatches = 0, first = null;
  for (let i = 0; i < output.length; i++) {
    if (!Number.isFinite(expected[i])) throw new Error('Non-finite target');
    if (actualBits[i] !== expectedBits[i]) {
      mismatches++; first ??= {index: i, actual: output[i], expected: expected[i]};
    }
  }
  const bits = new Uint32Array(Float32Array.of(result.normalizations[channel]).buffer)[0];
  if (bits !== runtime.normalizedHeaders[channel].normalizationValueBits) scalarMismatches++;
  return {channel, compared: output.length, mismatches, first,
    predictedSha256: digest(new Uint8Array(output.buffer))};
});
const passed = scalarMismatches === 0 && comparisons.every((c) => !c.mismatches);
console.log(JSON.stringify({passed, comparisons, normalizations: result.normalizations,
  scales: result.scales, scalarMismatches, shapedInputStillCaptured: true,
  shapingComputed: false, fullIrNodesGenerated: false}, null, 2));
if (!passed) process.exitCode = 1;
