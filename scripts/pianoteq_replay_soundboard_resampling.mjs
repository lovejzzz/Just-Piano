#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createSoundboardResamplingPlan,resampleSoundboardResponse} from '../dsp/soundboard-resampling.mjs';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: resampling-capture-directory');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (runtime.resamplingErrors?.length || runtime.resamplingPending || !runtime.runStatus?.terminal ||
    runtime.runStatus.exitStatus !== 0 || !runtime.resamplingRecords?.length) throw new Error('Completed resampling capture required');
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (descriptor, bytes) => {
  if (!descriptor || path.basename(descriptor.file) !== descriptor.file) throw new Error('Invalid descriptor');
  const b = fs.readFileSync(path.join(directory, descriptor.file));
  if (b.length !== bytes || b.length !== descriptor.bytes || digest(b) !== descriptor.sha256) throw new Error('Resampling descriptor differs');
  return b;
};
const nativePlan = runtime.resamplingPlan;
if (!nativePlan) throw new Error('Resampling plan required');
const plan = createSoundboardResamplingPlan(nativePlan.ratio, nativePlan.quality);
const header = read(nativePlan.header, 0x34);
if (header.readUInt32LE(0x28) !== plan.numerator || header.readUInt32LE(0x2c) !== plan.denominator ||
    header.readUInt32LE(0x30) !== plan.filterLength || nativePlan.numerator !== plan.numerator ||
    nativePlan.denominator !== plan.denominator || nativePlan.filterLength !== plan.filterLength) {
  throw new Error('Native rational plan differs');
}
function compare(output, descriptor) {
  const expected = read(descriptor, output.byteLength), actual = new Uint32Array(output.buffer);
  let mismatches = 0, first = null;
  for (let i = 0; i < actual.length; i++) {
    if (!Number.isFinite(expected.readFloatLE(i * 4))) throw new Error('Non-finite target');
    if (actual[i] !== expected.readUInt32LE(i * 4)) {
      mismatches++; first ??= {index: i, actual: output[i], expected: expected.readFloatLE(i * 4)};
    }
  }
  return {compared: actual.length, mismatches, first, predictedSha256: digest(new Uint8Array(output.buffer))};
}
const coefficientComparison = compare(plan.coefficients, nativePlan.coefficients);
const comparisons = runtime.resamplingRecords.map((record, index) => {
  if (record.number !== index || record.channels !== 1 || !Number.isInteger(record.length) || record.length < 1) {
    throw new Error('Invalid mono resampling record');
  }
  const input = new Float32Array(Uint8Array.from(read(record.input, record.length * 4)).buffer);
  const result = resampleSoundboardResponse(input, plan);
  if (result.output.length !== record.outputLength) throw new Error('Output shape differs');
  return {record: index, frames: result.frames, ...compare(result.output, record.output)};
});
const passed = !coefficientComparison.mismatches && comparisons.every((c) => !c.mismatches);
console.log(JSON.stringify({passed, coefficientComparison, comparisons, resamplingComputed: true, coefficientsComputed: true,
  inputResponsesStillCaptured: true, fullIrNodesGenerated: false}, null, 2));
if (!passed) process.exitCode = 1;
