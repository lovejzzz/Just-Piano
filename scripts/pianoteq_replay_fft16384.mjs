#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {forwardReal16384, inverseReal16384} from '../dsp/real-fft-16384.mjs';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: native-FFT-capture-directory');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (runtime.fftErrors?.length || runtime.fftPending || !runtime.runStatus?.terminal ||
    runtime.runStatus.exitStatus !== 0 || runtime.fftRecords?.length !== 6) throw new Error('Complete six-call FFT capture required');
const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');
const read = (descriptor, length) => {
  if (!descriptor || path.basename(descriptor.file) !== descriptor.file) throw new Error('Invalid descriptor');
  const bytes = fs.readFileSync(path.join(directory, descriptor.file));
  if (bytes.length !== length || bytes.length !== descriptor.bytes || digest(bytes) !== descriptor.sha256) {
    throw new Error('FFT capture digest or shape differs');
  }
  return bytes;
};
const comparisons = runtime.fftRecords.map((record, index) => {
  const plan = read(record.setup, 0x88);
  const words = Array.from({length: 10}, (_, i) => plan.readUInt32LE(i * 4));
  if (record.number !== index || record.length !== 16384 || words[0] !== 16384 ||
      words[1] !== 2048 || words[2] !== 4096 || words[3] !== 6 ||
      words.slice(4).some((v) => v !== 4) || plan.readUInt32LE(0x6c) !== 0 ||
      record.direction !== index % 2) throw new Error('Unverified native FFT profile');
  const input = new Float32Array(Uint8Array.from(read(record.input, 16384 * 4)).buffer);
  const output = (record.direction ? inverseReal16384 : forwardReal16384)(input);
  const predictedSha256 = digest(new Uint8Array(output.buffer));
  const expected = read(record.output, 16384 * 4);
  const bits = new Uint32Array(output.buffer);
  let mismatches = 0, maximum = 0, first = null;
  for (let i = 0; i < output.length; i++) {
    const value = expected.readFloatLE(i * 4);
    if (!Number.isFinite(value)) throw new Error('Non-finite native target');
    if (bits[i] !== expected.readUInt32LE(i * 4)) {
      mismatches++; maximum = Math.max(maximum, Math.abs(output[i] - value));
      first ??= {index: i, actual: output[i], expected: value};
    }
  }
  return {record: index, direction: record.direction, compared: output.length,
    mismatches, maximum, first, predictedSha256, inputSha256: record.input.sha256};
});
const passed = comparisons.every((c) => !c.mismatches);
console.log(JSON.stringify({passed, comparisons, coefficientsComputed: true,
  nativePlanCoefficientsUsedForPrediction: false, inverseScaled: false,
  nativeTransformVerifiedForCapturedProfile: passed, shapingComputed: false}, null, 2));
if (!passed) process.exitCode = 1;
