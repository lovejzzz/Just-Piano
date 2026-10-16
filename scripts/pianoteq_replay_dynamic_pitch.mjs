// node SCRIPT return.json exp.json report.json [--source-report source.json]
import fs from 'node:fs';
import { dynamicPitchStep } from '../dsp/dynamic-pitch.mjs';
const [returnPath, expPath, reportPath, ...options] = process.argv.slice(2);
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const actual = read(returnPath), exponential = read(expPath);
if (actual.schema !== 1 || actual.point !== '0x1006e5158' || exponential.schema !== 1 || exponential.point !== '0x1006e5584' ||
    [actual, exponential].some(d => d.errors.length || d.records.length !== 64)) throw new Error('Complete dynamic-pitch captures required');
let source = null;
if (options.length) {
  if (options.length !== 2 || options[0] !== '--source-report') throw new Error('Expected --source-report path');
  source = read(options[1]);
  if (source.schema !== 'pianoteq-pitch-source-pass21' || source.passed !== true || source.predictions?.length !== 1 ||
      !source.predictions[0].prediction || source.mismatches !== 0 ||
      source.runtimeCurvesVerified !== true) throw new Error('Verified source initialization report required');
}
const word = new DataView(new ArrayBuffer(4));
const bits = value => { word.setFloat32(0, value); return word.getUint32(0).toString(16).padStart(8, '0'); };
const checks = [], failures = [], predictions = [];
function check(name, prediction, observed) {
  if (!Number.isFinite(observed)) throw new Error(`Missing actual ${name}`);
  const equal = bits(prediction) === bits(observed);
  checks.push({ name, prediction, actual: observed, bitExact: equal });
  if (!equal) failures.push({ name, prediction, actual: observed, predictedBits: bits(prediction), actualBits: bits(observed) });
}
const first = actual.records[0], parameters = source?.predictions[0].prediction ?? {
  strength: first.controls['0x938'], decay: first.controls['0x93c'], velocityScale: first.controls['0x940'],
  exponentialBranch: first.flags['0x934'] === 1, initialDisabled: false };
let state = { disabled: parameters.initialDisabled };
const expByAge = new Map(exponential.records.map(row => [`${row.stage}:${row.sample_age}`, row]));
if (expByAge.size !== 64 || new Set(actual.records.map(r => r.V)).size !== 1 || first.sample_age !== 0 ||
    actual.records.filter(r => r.stage === 'held').length !== 32 || actual.records.filter(r => r.stage === 'released').length !== 32)
  throw new Error('Incomplete or ambiguous pitch sequence');
for (const [index, row] of actual.records.entries()) {
  const key = `${row.stage}:${row.sample_age}`, e = expByAge.get(key), c = row.controls, flags = row.flags;
  if (!e || (index && row.sample_age <= actual.records[index - 1].sample_age) || flags['0x83d'] !== 0)
    throw new Error('Unexpected dynamic-pitch order or alternate path');
  check(`${key}-strength`, parameters.strength, c['0x938']); check(`${key}-relaxation`, parameters.decay, c['0x93c']);
  check(`${key}-velocity`, parameters.velocityScale, c['0x940']);
  if (parameters.exponentialBranch !== (flags['0x934'] === 1)) throw new Error('Pitch branch changes');
  const prediction = dynamicPitchStep({ sampleAge: row.sample_age, timestep: c['0x8fc'], centsA: c['0x82c'], centsB: c['0x8bc'],
    strength: parameters.strength, relaxation: parameters.decay, velocityScale: parameters.velocityScale,
    modalDecay: c['0x25c'], exponentialBranch: parameters.exponentialBranch, released: flags['0x924'] === 1,
    releaseRule: flags['0x931'] === 1, damperFlag: (flags['0x925'] & 1) !== 0,
    releaseAmount: c['0x8d8'], smoothedRatio: c['0x8e0'] }, state);
  if (prediction.exponential === null) throw new Error('Expected observed exponential branch');
  check(`${key}-time`, prediction.time, e.time);
  check(`${key}-expf`, prediction.exponential, e.exponential);
  check(`${key}-pitch`, prediction.pitch, c['0x780']);
  if (prediction.disabled !== ((flags['0x930'] & 1) !== 0)) throw new Error('Disabled-state transition differs');
  state = { disabled: prediction.disabled };
  predictions.push({ stage: row.stage, sampleAge: row.sample_age, pitch: prediction.pitch, timestep: c['0x8fc'] });
}
const report = { schema: 'pianoteq-dynamic-pitch-pass21', passed: failures.length === 0, records: actual.records.length,
  comparedFloatValues: checks.length, mismatches: failures.length, checks, failures,
  sourceInitializationComputed: Boolean(source), sourceParametersStillCaptured: !source,
  sourceHostAndSharedControlsStillCaptured: true,
  ageCounterAndOtherControlsStillCaptured: true, nativeMathOracleRequired: false,
  predictedControls: predictions, wholeVoiceAudioVerified: false };
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined, predictedControls: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
