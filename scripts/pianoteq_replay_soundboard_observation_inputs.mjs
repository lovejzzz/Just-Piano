#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {initializeSoundboardFromConfig} from '../dsp/soundboard-initialization.mjs';
import {constructSoundboardObservationDistances} from '../dsp/soundboard-observation-distance.mjs';
import {prepareSoundboardObservations} from '../dsp/soundboard-observation.mjs';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: private-observation-capture');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (!runtime.runStatus?.terminal || runtime.runStatus.exitStatus !== 0 || runtime.errors?.length ||
    runtime.observationErrors?.length || runtime.observationPending || runtime.observationInputs?.length !== 3) throw new Error('Complete observation capture required');
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
function read(d) {
  if (!d || path.basename(d.file) !== d.file) throw new Error('Invalid descriptor');
  const bytes = fs.readFileSync(path.join(directory, d.file));
  if (bytes.length !== d.bytes || digest(bytes) !== d.sha256) throw new Error('Descriptor digest differs');
  return bytes;
}
function floats(d) {return new Float32Array(Uint8Array.from(read(d)).buffer);}
function compare(bytes, d, label) {
  const target = read(d);
  if (bytes.length !== target.length) throw new Error(`Comparison length differs: ${label}`);
  let mismatches = 0, first = null;
  for (let i = 0; i < bytes.length; i += 4) if (bytes.readUInt32LE(i) !== target.readUInt32LE(i)) {
    mismatches++; first ??= {index: i / 4, actual: bytes.readUInt32LE(i), expected: target.readUInt32LE(i)};
  }
  return {label, compared: bytes.length / 4, mismatches, first, predictedSha256: digest(bytes)};
}
const bytes = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const records = runtime.observationInputs.map((record, index) => {
  if (record.index !== index || record.geometry.length !== record.preparations.length) throw new Error('Group/geometry count differs');
  const gains = floats(record.gains);
  if (gains.length !== 3) throw new Error('Three geometry gains required');
  const config = read(record.config), bridge = floats(record.bridge), get = (o) => config.readFloatLE(o);
  const {grid} = initializeSoundboardFromConfig(config, bridge);
  const coordinates = record.geometry.map((g) => floats(g.coordinates));
  const result = constructSoundboardObservationDistances(grid, coordinates, get(0x34));
  const comparisons = [compare(bytes(result.distances), record.distances, 'distances'),
    compare(bytes(result.directions), record.directions, 'directions')];
  const inverseScale = Math.fround(1 / Math.fround(get(0x88) * grid.tau));
  let controlMismatches = Number(!Object.is(record.planeHeight, get(0x34)));
  for (let i = 0; i < record.preparations.length; i++) {
    const p = record.preparations[i], geometry = record.geometry[i];
    const amplitudeScale = Math.fround(gains[geometry.kind] * geometry.amplitude);
    const flags = Number(config.readUInt32LE(0xe4) === 2);
    controlMismatches += Number(p.count !== grid.size || !Object.is(p.inverseScale, inverseScale) ||
      !Object.is(p.amplitudeScale, amplitudeScale) || p.flags !== flags || ![0, 1].includes(p.phaseMode));
    const begin = i * grid.size, end = begin + grid.size;
    comparisons.push(compare(bytes(result.distances.subarray(begin, end)), p.distances, `input-distances-${i}`),
      compare(bytes(result.directions.subarray(begin, end)), p.directions, `input-directions-${i}`));
    const prepared = prepareSoundboardObservations({inverseScale, amplitudeScale, flags, phaseMode: Boolean(p.phaseMode),
      frequencies: result.distances.subarray(begin, end), coefficients: result.directions.subarray(begin, end)});
    const output = Buffer.alloc(prepared.length * 20);
    prepared.forEach((r, j) => {
      output.writeUInt32LE(r.stateIndex, j * 20); output.writeUInt32LE(r.frequencyIndex, j * 20 + 4);
      output.writeFloatLE(r.phaseWeight, j * 20 + 8); output.writeFloatLE(r.first, j * 20 + 12); output.writeFloatLE(r.second, j * 20 + 16);
    });
    comparisons.push(compare(output, p.output, `prepared-${i}`));
  }
  return {index, controlMismatches, phaseModes: [...new Set(record.preparations.map((p) => p.phaseMode))], comparisons};
});
const passed = records.every((r) => !r.controlMismatches && r.comparisons.every((c) => !c.mismatches));
console.log(JSON.stringify({passed, records, capturedDistancesOrPreparedRecordsUsedForPrediction: false,
  geometryCoordinatesStillCaptured: true, phaseModeStillCaptured: true,
  completeObservationGroupConstructionVerified: false, fullModelToIrGenerationVerified: false}, null, 2));
if (!passed) process.exitCode = 1;
