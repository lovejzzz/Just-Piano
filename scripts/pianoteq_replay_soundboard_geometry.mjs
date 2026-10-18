#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {initializeSoundboardFromConfig} from '../dsp/soundboard-initialization.mjs';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: private-geometry-capture');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (!runtime.runStatus?.terminal || runtime.runStatus.exitStatus !== 0 || runtime.errors?.length ||
    runtime.geometryErrors?.length || runtime.geometryPending || runtime.geometryRecords?.length !== 3) {
  throw new Error('Complete three-group geometry capture required');
}
function read(d) {
  if (!d || path.basename(d.file) !== d.file) throw new Error('Invalid descriptor');
  const b = fs.readFileSync(path.join(directory, d.file));
  if (b.length !== d.bytes || crypto.createHash('sha256').update(b).digest('hex') !== d.sha256) throw new Error('Descriptor differs');
  return b;
}
function compare(words, target, label) {
  if (words.length * 4 !== target.length) throw new Error('Geometry shape differs');
  let mismatches = 0;
  for (let i = 0; i < words.length; i++) if (words[i] !== target.readUInt32LE(i * 4)) mismatches++;
  return {label, compared: words.length, mismatches,
    predictedSha256: crypto.createHash('sha256').update(new Uint8Array(words.buffer, words.byteOffset, words.byteLength)).digest('hex')};
}
const records = runtime.geometryRecords.map((record, index) => {
  if (record.number !== index) throw new Error('Geometry group order differs');
  const bytes = read(record.config);
  if (bytes.length !== 0x130) throw new Error('Geometry config shape differs');
  const bridge = new Float32Array(Uint8Array.from(read(record.bridge)).buffer);
  const {grid, excitation, excitationParameters: [amplitude, width]} = initializeSoundboardFromConfig(bytes, bridge);
  const header = read(record.header);
  if (header.length !== 0x70) throw new Error('Geometry header shape differs');
  const scalars = new Uint32Array(5); scalars.set(new Uint32Array(Float32Array.of(grid.h, grid.tau).buffer));
  scalars.set([grid.nx, grid.ny, grid.size], 2);
  const metadata = new Uint32Array(3); metadata.set(new Uint32Array(grid.boundaryScale.buffer)); metadata[2] = grid.excitationIndex;
  const comparisons = [compare(scalars, header.subarray(0, 20), 'grid'),
    compare(metadata, header.subarray(0x60, 0x6c), 'boundary-scale/source-index'),
    ...['active', 'inactive', 'bridgeIndices'].map((key) => compare(grid[key], read(record[key]), key)),
    compare(new Uint32Array(excitation.output.buffer), read(record.excitation), 'excitation')];
  const controlMismatches = !Array.isArray(record.excitationParameters) || record.excitationParameters.length !== 2 ||
    !Object.is(amplitude, record.excitationParameters[0]) || !Object.is(width, record.excitationParameters[1]);
  return {group: index, excitationIndex: grid.excitationIndex, comparisons, controlMismatches};
});
const passed = records.every((r) => !r.controlMismatches && r.comparisons.every((c) => !c.mismatches));
console.log(JSON.stringify({passed, records, gridAndBoundaryConstructed: true, excitationConstructed: true,
  configurationStillCaptured: true, sparseMatricesConstructed: false, completeVoiceVerified: false}, null, 2));
if (!passed) process.exitCode = 1;
