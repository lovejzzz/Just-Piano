#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {soundboardCurveGain} from '../dsp/soundboard-curve-gain.mjs';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: curveGain-capture-directory');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (runtime.curveGainErrors?.length || runtime.curveGainPending || !runtime.runStatus?.terminal ||
    runtime.runStatus.exitStatus !== 0 || !runtime.curveGainRecords?.length) throw new Error('Completed curveGain capture required');
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (descriptor, bytes) => {
  if (!descriptor || path.basename(descriptor.file) !== descriptor.file) throw new Error('Invalid descriptor');
  const b = fs.readFileSync(path.join(directory, descriptor.file));
  if (b.length !== bytes || b.length !== descriptor.bytes || digest(b) !== descriptor.sha256) throw new Error('Curve gain descriptor differs');
  return b;
};
const comparisons = runtime.curveGainRecords.map((record, index) => {
  if (record.number !== index || !Number.isInteger(record.length) || record.length < 1) throw new Error('Invalid record');
  const floats = (d) => new Float32Array(Uint8Array.from(read(d, d.bytes)).buffer);
  const header = read(record.header, 80);
  if (header.readUInt32LE(72) !== record.dimensions || record.vectors?.length !== 3) throw new Error('Curve dimensions differ');
  const [smoothingWidth, mix, binSpacing] = record.parameters;
  const result = soundboardCurveGain({x: floats(record.vectors[1]), y: floats(record.vectors[2]),
    dimensions: record.dimensions, logX: header[76], mode: header[77]},
    {length: record.length, smoothingWidth, mix, binSpacing});
  return {record: index, comparisons: ['interpolated', 'beforeSmoothing', 'output'].map((stage) => {
    const actual = new Uint32Array(result[stage].buffer);
    const expected = read(record[stage], result[stage].byteLength);
    let mismatches = 0, first = null;
    for (let i = 0; i < actual.length; i++) {
      if (!Number.isFinite(expected.readFloatLE(i * 4))) throw new Error('Non-finite target');
      if (actual[i] !== expected.readUInt32LE(i * 4)) {
        mismatches++; first ??= {index: i, actual: result[stage][i], expected: expected.readFloatLE(i * 4)};
      }
    }
    return {stage, compared: actual.length, mismatches, first,
      predictedSha256: digest(new Uint8Array(result[stage].buffer))};
  })};
});
const passed = comparisons.every((r) => r.comparisons.every((c) => !c.mismatches));
console.log(JSON.stringify({passed, comparisons, curveGainComputed: true,
  curveKnotsStillCaptured: true, shapingComputed: false}, null, 2));
if (!passed) process.exitCode = 1;
