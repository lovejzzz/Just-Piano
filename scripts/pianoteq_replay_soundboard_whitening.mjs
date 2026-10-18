#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {whitenSoundboardSpectrum} from '../dsp/soundboard-spectrum-whitening.mjs';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: whitening-capture-directory');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (runtime.whiteningErrors?.length || runtime.whiteningPending || !runtime.runStatus?.terminal ||
    runtime.runStatus.exitStatus !== 0 || !runtime.whiteningRecords?.length) throw new Error('Completed whitening capture required');
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (descriptor, bytes) => {
  if (!descriptor || path.basename(descriptor.file) !== descriptor.file) throw new Error('Invalid descriptor');
  const b = fs.readFileSync(path.join(directory, descriptor.file));
  if (b.length !== bytes || b.length !== descriptor.bytes || digest(b) !== descriptor.sha256) throw new Error('Whitening descriptor differs');
  return b;
};
const comparisons = runtime.whiteningRecords.map((record, index) => {
  if (record.number !== index || !Number.isInteger(record.length) || record.length < 1) throw new Error('Invalid record');
  const input = new Float32Array(Uint8Array.from(read(record.input, record.length * 4)).buffer);
  if (!Array.isArray(record.parameters) || record.parameters.length !== 3 ||
      record.parameters.some((v) => !Number.isFinite(v))) throw new Error('Invalid parameters');
  const [amount, width, binSpacing] = record.parameters;
  const result = whitenSoundboardSpectrum(input, {amount, width, binSpacing, flags: record.flags});
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
  return {record: index, parameters: record.parameters, flags: record.flags, compared: actual.length,
    mismatches, first, predictedSha256};
});
const passed = comparisons.every((c) => !c.mismatches);
console.log(JSON.stringify({passed, comparisons, whiteningComputed: true,
  inputSpectraStillCaptured: true, shapingComputed: false}, null, 2));
if (!passed) process.exitCode = 1;
