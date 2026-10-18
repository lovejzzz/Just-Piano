#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildReal16384Coefficients} from '../dsp/real-fft-16384-coefficients.mjs';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: native-FFT-capture-directory');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (runtime.fftErrors?.length || runtime.fftPending || !runtime.runStatus?.terminal ||
    runtime.runStatus.exitStatus !== 0 || runtime.fftRecords?.length !== 6) throw new Error('Complete six-call FFT capture required');
const read = (descriptor, length) => {
  if (!descriptor || path.basename(descriptor.file) !== descriptor.file) throw new Error('Invalid descriptor');
  const b = fs.readFileSync(path.join(directory, descriptor.file));
  if (b.length !== length || b.length !== descriptor.bytes ||
      crypto.createHash('sha256').update(b).digest('hex') !== descriptor.sha256) throw new Error('FFT capture digest or shape differs');
  return b;
};
const c = buildReal16384Coefficients();
const comparisons = runtime.fftRecords.map((record) => {
  const header = read(record.setup, 0x88);
  const words = Array.from({length: 10}, (_, i) => header.readUInt32LE(i * 4));
  if (record.length !== 16384 || words[0] !== 16384 || words[1] !== 2048 ||
      words[2] !== 4096 || words[3] !== 6 || words.slice(4).some((v) => v !== 4) ||
      header.readUInt32LE(0x6c) !== 0) throw new Error('Unexpected native FFT factorization');
  read(record.input, 16384 * 4); read(record.output, 16384 * 4);
  let compared = 0, mismatches = 0, first = null;
  for (const key of ['e', 'twiddle']) {
    const expected = read(record[key], c[key].byteLength);
    const actual = new Uint32Array(c[key].buffer);
    for (let i = 0; i < actual.length; i++) {
      if (key === 'twiddle' && !c.usedTwiddle[i]) continue;
      compared++;
      if (actual[i] !== expected.readUInt32LE(i * 4)) {
        mismatches++; first ??= {key, index: i};
      }
    }
  }
  return {record: record.number, direction: record.direction, compared, mismatches, first};
});
if (comparisons.filter((r) => r.direction === 0).length !== 3 ||
    comparisons.filter((r) => r.direction === 1).length !== 3) throw new Error('Forward/inverse call coverage differs');
const passed = comparisons.every((r) => r.compared === 16350 && !r.mismatches);
console.log(JSON.stringify({passed, comparisons, nativeTransformVerified: false,
  coefficientsVerifiedOnly: true, unusedTwiddlePositionsExcluded: 34}, null, 2));
if (!passed) process.exitCode = 1;
