#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {smoothSoundboardSpectrum} from '../dsp/soundboard-spectrum-smoothing.mjs';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: smoothing-capture-directory');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (runtime.smoothingErrors?.length || runtime.smoothingPending || !runtime.runStatus?.terminal ||
    runtime.runStatus.exitStatus !== 0 || !runtime.smoothingRecords?.length) throw new Error('Completed smoothing capture required');
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (descriptor, bytes) => {
  if (!descriptor || path.basename(descriptor.file) !== descriptor.file) throw new Error('Invalid descriptor');
  const b = fs.readFileSync(path.join(directory, descriptor.file));
  if (b.length !== bytes || b.length !== descriptor.bytes || digest(b) !== descriptor.sha256) throw new Error('Smoothing descriptor differs');
  return b;
};
const comparisons = runtime.smoothingRecords.map((record, index) => {
  if (record.number !== index || !Number.isInteger(record.length) || record.length < 1) throw new Error('Invalid record');
  const input = new Float32Array(Uint8Array.from(read(record.input, record.length * 4)).buffer);
  const result = smoothSoundboardSpectrum(input, record.cutoff);
  const c = result.coefficients;
  const coefficientBits = new Uint32Array(Float32Array.of(c.b1, c.b0, c.a1, 0, 0).buffer);
  const expectedCoefficients = read(record.coefficients, 20);
  let coefficientMismatches = 0;
  for (let i = 0; i < 5; i++) if (coefficientBits[i] !== expectedCoefficients.readUInt32LE(i * 4)) coefficientMismatches++;
  const predictedSha256 = digest(new Uint8Array(result.output.buffer));
  const expected = read(record.output, record.length * 4);
  const actual = new Uint32Array(result.output.buffer);
  let mismatches = 0, first = null;
  for (let i = 0; i < actual.length; i++) {
    if (!Number.isFinite(expected.readFloatLE(i * 4))) throw new Error('Non-finite target');
    if (actual[i] !== expected.readUInt32LE(i * 4)) {
      mismatches++; first ??= {index: i, actual: result.output[i], expected: expected.readFloatLE(i * 4)};
    }
  }
  return {record: index, cutoff: record.cutoff, compared: actual.length,
    coefficientMismatches, mismatches, first, predictedSha256};
});
const passed = comparisons.every((c) => !c.mismatches && !c.coefficientMismatches);
console.log(JSON.stringify({passed, comparisons, coefficientsComputed: true,
  inputSpectraStillCaptured: true, shapingComputed: false}, null, 2));
if (!passed) process.exitCode = 1;
