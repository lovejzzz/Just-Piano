#!/usr/bin/env node
// Historical second-entry snapshots are diagnostic, not isolated return captures.
import fs from 'node:fs';
import path from 'node:path';
import {applySoundboardOutputKernel} from '../dsp/soundboard-output-kernel.mjs';

const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: capture-directory');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (runtime.errors?.length) throw new Error('Capture has errors');
const c = runtime.capture;
const floats = (name) => {
  const bytes = fs.readFileSync(path.join(directory, name));
  if (bytes.length % 4) throw new Error('Unaligned float data');
  return new Float32Array(Uint8Array.from(bytes).buffer);
};
const cache = floats('block-cache.bin');
if (cache.length !== 1500 * 65) throw new Error('Unexpected cache shape');
const blocks = Array.from({length: 1500}, (_, i) => cache.subarray(i * 65, (i + 1) * 65));
const output = floats('output-before.bin');
const expected = floats('output-after.bin');
if (!output.length || expected.length !== output.length || c.outputLength !== output.length) {
  throw new Error('Invalid output shape');
}
let cursor = 0;
let coefficient = 0;
let groups = 0;
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
  applySoundboardOutputKernel({offset, entries}, blocks, output, c.blockStart);
  groups++;
}
if (!groups) throw new Error('No entry groups');
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
  snapshotBoundary: runtime.records?.[0]?.completedAt ?? 'unknown',
  isolatedNativeReturnVerified: false, matchedSnapshot: mismatches === 0}, null, 2));
if (mismatches) process.exitCode = 1;
