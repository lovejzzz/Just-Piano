#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {initializeSoundboardFromConfig} from '../dsp/soundboard-initialization.mjs';
import {constructSoundboardMatrices} from '../dsp/soundboard-matrix-construction.mjs';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: private-matrix-solver-capture');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (!runtime.runStatus?.terminal || runtime.runStatus.exitStatus !== 0 || runtime.errors?.length ||
    runtime.sparseErrors?.length || runtime.sparsePending || runtime.sparseRecords?.length !== 3) {
  throw new Error('Complete three-group matrix/solver capture required');
}
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function read(d) {
  if (!d || path.basename(d.file) !== d.file) throw new Error('Invalid descriptor');
  const b = fs.readFileSync(path.join(directory, d.file));
  if (b.length !== d.bytes || digest(b) !== d.sha256) throw new Error('Descriptor differs');
  return b;
}
function compareVector(output, descriptor, label) {
  const target = read(descriptor), actual = new Uint32Array(output.buffer, output.byteOffset, output.length);
  if (output.byteLength !== target.length) throw new Error('Vector shape differs');
  let mismatches = 0;
  for (let i = 0; i < output.length; i++) {
    if (!Number.isFinite(target.readFloatLE(i * 4))) throw new Error('Non-finite target');
    if (actual[i] !== target.readUInt32LE(i * 4)) mismatches++;
  }
  return {label, compared: output.length, mismatches, predictedSha256: digest(new Uint8Array(output.buffer, output.byteOffset, output.byteLength))};
}
function compareMatrix(rows, descriptor, label) {
  const target = JSON.parse(read(descriptor));
  if (target.columns !== rows.length || target.rows.length !== rows.length) throw new Error('Matrix dimensions differ');
  let structureMismatches = 0, coefficientMismatches = 0, compared = 0;
  const words = [rows.length], view = new DataView(new ArrayBuffer(4));
  for (let i = 0; i < rows.length; i++) {
    const expected = target.rows[i];
    if (expected.row !== i) throw new Error('Native matrix row order differs');
    if (expected.entries.length !== rows[i].length) structureMismatches++;
    words.push(rows[i].length);
    for (let j = 0; j < rows[i].length; j++) {
      const actual = rows[i][j], oracle = expected.entries[j];
      view.setFloat32(0, actual.value); const bits = view.getUint32(0);
      words.push(actual.index, bits); compared++;
      if (!oracle || oracle.index !== actual.index) structureMismatches++;
      if (oracle) {
        if (!Number.isFinite(oracle.value)) throw new Error('Non-finite coefficient');
        view.setFloat32(0, oracle.value);
        if (bits !== view.getUint32(0)) coefficientMismatches++;
      }
    }
  }
  return {label, compared, structureMismatches, coefficientMismatches,
    predictedSha256: digest(new Uint8Array(Uint32Array.from(words).buffer))};
}
const records = runtime.sparseRecords.map((record, index) => {
  if (record.number !== index || record.iterations?.length !== 5) throw new Error('Native matrix group/trace differs');
  const config = read(record.config), get = (offset) => config.readFloatLE(offset);
  const bridge = new Float32Array(Uint8Array.from(read(record.bridge)).buffer);
  const {grid} = initializeSoundboardFromConfig(config, bridge);
  const parameters = [get(0x98), get(0x9c), get(0xa0), get(0x28)];
  const result = constructSoundboardMatrices(grid, {baseScale: parameters[0], bridgeScaleAdd: parameters[1],
    contrast: parameters[2], method: parameters[3], traceCount: 5});
  const vectors = [compareVector(new Float32Array(grid.active.length), record.initial, 'initial'),
    compareVector(new Float32Array(grid.active.length).fill(-1), record.rhs, 'rhs'),
    compareVector(result.solve.solution, record.solution, 'solution'), compareVector(result.shape, record.shape, 'shape')];
  for (const step of record.iterations) {
    if (!result.solve.trace[step.step]) throw new Error('Missing computed iteration');
    for (const key of ['solution', 'p', 'r', 'q']) {
      vectors.push(compareVector(result.solve.trace[step.step][key], step[key], `iteration-${step.step}-${key}`));
    }
  }
  const before = read(record.optionsBefore), after = read(record.optionsAfter);
  if (before.length !== 0x60 || after.length !== 0x60) throw new Error('Native solver option shape differs');
  const controlMismatches = parameters.some((v, i) => !Object.is(v, record.parameters[i])) ||
    before.readDoubleLE(0x18) !== Math.fround(1e-7) || after.readBigUInt64LE(0x30) !== BigInt(result.solve.iterations) ||
    record.iterationsSeen !== result.solve.iterations + 1 || after.readDoubleLE(0) !== result.solve.rhsNorm ||
    after.readDoubleLE(0x38) !== result.solve.residualNorm;
  const matrices = [compareMatrix(result.laplacian.reduced, record.matrix, 'reduced-Laplacian'),
    compareMatrix(result.matrixA, record.matrixA, 'A'), compareMatrix(result.matrixC, record.matrixC, 'C')];
  return {group: index, iterations: result.solve.iterations, residualNorm: result.solve.residualNorm,
    controlMismatches, vectors, matrices};
});
const passed = records.every((r) => !r.controlMismatches && r.vectors.every((v) => !v.mismatches) &&
  r.matrices.every((m) => !m.structureMismatches && !m.coefficientMismatches));
console.log(JSON.stringify({passed, records, matricesConstructedFromConfiguration: true,
  capturedMatrixOrSolutionUsedForPrediction: false, configurationStillCaptured: true,
  observationGroupsStillCaptured: true, fullModelToIrGenerationVerified: false}, null, 2));
if (!passed) process.exitCode = 1;
