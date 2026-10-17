// Computed stretch-source verification on preserved real captures, no target writes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {constructStretchTable} from '../dsp/construct-stretch-table.mjs';
import {archiveStretchControls} from '../dsp/stretch-rhs.mjs';
const [root, directory, ...extra] = process.argv.slice(2);
if (!directory || extra.length) throw new Error('Usage: analysis-root new-directory');
fs.mkdirSync(directory);
const f = name => path.join(root, name), script = fileURLToPath(new URL('./pianoteq_replay_stretch_rhs.mjs', import.meta.url));
const paths = {counts: f('debug-pass19-stretch-counts-v2/runtime.json'), raw: f('debug-pass19-stretch-raw/runtime.json'),
  filter: f('debug-pass19-stretch-filter/runtime.json'), weights: f('debug-pass18-stretch-weights/runtime.json'),
  table: f('debug-pass18-stretch-table/runtime.json'), controls: f('pass132-native-controls-report.json'),
  base: f('base-model-full-values-pass13.json'), preset: f('dry-full-fxp-pass13.json')};
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const original = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, sha(fs.readFileSync(file))]));
const denied = path.join(directory, 'denied-oracle');
fs.writeFileSync(denied, '#!/bin/sh\necho "denied external stretch math" >&2\nexit 93\n', {mode: 0o755, flag: 'wx'});
function run(name, overrides = {}, native = true) {
  const folder = path.join(directory, name); fs.mkdirSync(folder); const p = {...paths, ...overrides}, output = path.join(folder, 'report.json');
  const args = [script, p.counts, p.raw, p.filter, p.weights, p.table, denied, output, '--source-controls-report', p.controls, '--archives', p.base, p.preset];
  if (native) args.push('--native-math');
  const r = spawnSync(process.execPath, args, {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  fs.writeFileSync(path.join(folder, 'process.json'), JSON.stringify({status: r.status, signal: r.signal, error: r.error?.message, stdout: r.stdout, stderr: r.stderr}, null, 2) + '\n');
  assert.equal(r.signal, null);
  return {process: r, report: fs.existsSync(output) ? JSON.parse(fs.readFileSync(output)) : undefined};
}
const baseline = run('baseline'); assert.equal(baseline.process.status, 0);
assert(baseline.report.passed && !baseline.report.rhsStillCaptured && !baseline.report.stiffnessStillCaptured && !baseline.report.nativeMathOracleRequired);
assert.equal(baseline.report.oracleUniqueCalls, 0); assert.equal(baseline.report.oracleCalls.length, 0);
assert.equal(baseline.report.sourceControlsDependency.platformTranscendentalOracleRequired, false);
for (const [name, count] of [['complete-rhs', 203], ['matrix', 41209], ['solution', 203], ['frequency-table', 128]]) {
  const row = baseline.report.checks.find(c => c.name === name); assert(row.bitExact && row.count === count);
}
const prior = JSON.parse(fs.readFileSync(f('debug-pass19-stretch-filter/rhs-archive-replay.json')));
assert(prior.passed); assert.deepEqual(baseline.report.predictedRhs, prior.predictedRhs); assert.deepEqual(baseline.report.predictedTable, prior.predictedTable);
assert.deepEqual(baseline.report.computedMathCalls, prior.oracleCalls); assert.equal(baseline.report.computedMathCalls.length, 332);
const countsInput = JSON.parse(fs.readFileSync(paths.counts)).records[0], weightsInput = JSON.parse(fs.readFileSync(paths.weights)).records[0];
const tableTarget = JSON.parse(fs.readFileSync(paths.table)).records[0];
const modelControls = archiveStretchControls(JSON.parse(fs.readFileSync(paths.base))[0].fields,
  JSON.parse(fs.readFileSync(paths.preset)).decoded_tail.fields,
  {flags: countsInput.weight_curve.log_x, special: countsInput.weight_curve.special_mode, dimension: countsInput.weight_curve.dimension});
const savedMath = Object.fromEntries(['sin', 'cos', 'pow', 'log2'].map(name => [name, Math[name]]));
let built;
try {
  for (const name of Object.keys(savedMath)) Math[name] = () => { throw new Error('blocked JS ' + name); };
  built = constructStretchTable({controls: modelControls, stiffnessTable: JSON.parse(fs.readFileSync(paths.controls)).stiffnessTable.map(r => r.stiffnessDouble),
    middleWeight: weightsInput.middle_weight, gramScale: weightsInput.gram_scale});
} finally { Object.assign(Math, savedMath); }
const defaultChecks = [];
for (const [name, prediction, actual] of [['rhs', built.prepared.rhs, tableTarget.rhs], ['matrix', built.matrix.values, tableTarget.matrix.values],
  ['solution', built.solution, tableTarget.solution], ['table', built.table, tableTarget.table]]) {
  assert.deepEqual(Array.from(prediction), actual); defaultChecks.push({name, count: prediction.length, mismatches: 0});
}
fs.writeFileSync(path.join(directory, 'default-builder-audit.json'), JSON.stringify({passed: true, defaultMathUsed: true, jsFallbacksBlocked: true, registryWeightsStillObserved: true, checks: defaultChecks}, null, 2) + '\n');
const sineCalls = baseline.report.computedMathCalls.filter(c => c.name === 'sin'), oracle = f('pass123-system-math-oracle');
assert.equal(sineCalls.length, 106);
for (const call of sineCalls) {
  const r = spawnSync(oracle, ['sin', ...call.inputs], {encoding: 'utf8'});
  assert.equal(r.status, 0); assert.equal(r.signal, null); assert.equal(r.stdout.trim(), call.output);
}
fs.writeFileSync(path.join(directory, 'sine-calibration.json'), JSON.stringify({calls: sineCalls, mismatches: 0, oracleSha256: sha(fs.readFileSync(oracle)), systemMathOnly: true}, null, 2) + '\n');
const results = [];
function save(row) {
  results.push(row); fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({baseline: {passed: true, externalMathCalls: 0, computedMathCalls: 332, sineSystemChecks: 106, defaultBuilderVerifiedWithoutJsFallbacks: true}, originalHashes: original, results}, null, 2) + '\n');
  console.log(JSON.stringify(row));
}
function mutate(key, name, edit) {
  const d = JSON.parse(fs.readFileSync(paths[key])); edit(d); const file = path.join(directory, name + '.json');
  fs.writeFileSync(file, JSON.stringify(d) + '\n', {flag: 'wx'}); return {[key]: file};
}
const view = new DataView(new ArrayBuffer(8));
function flip(x, float = false) {
  if (float) { view.setFloat32(0, x); view.setUint32(0, view.getUint32(0) ^ 1); return view.getFloat32(0); }
  view.setFloat64(0, x); view.setBigUint64(0, view.getBigUint64(0) ^ 1n); return view.getFloat64(0);
}
for (const [name, key, edit] of [
  ['rhs-target', 'table', d => { d.records[0].rhs[108] = flip(d.records[0].rhs[108]); }],
  ['matrix-target', 'table', d => { d.records[0].matrix.values[0] = flip(d.records[0].matrix.values[0]); }],
  ['solution-target', 'table', d => { d.records[0].solution[0] = flip(d.records[0].solution[0]); }],
  ['frequency-target', 'table', d => { d.records[0].table[69] = flip(d.records[0].table[69], true); }],
  ['stiffness-target', 'counts', d => { d.records[0].stiffness_table[69] = flip(d.records[0].stiffness_table[69]); }],
  ['filter-target', 'filter', d => { d.records[0].output[0] = flip(d.records[0].output[0], true); }],
]) {
  const r = run(name, mutate(key, name, edit)); assert.equal(r.process.status, 1); assert.equal(r.report.failures.length, 1);
  assert.equal(r.report.checks.reduce((n, c) => n + c.mismatches, 0), 1);
  assert.deepEqual(r.report.predictedRhs, baseline.report.predictedRhs); assert.deepEqual(r.report.predictedTable, baseline.report.predictedTable);
  assert.deepEqual(r.report.computedMathCalls, baseline.report.computedMathCalls);
  save({name, expectedFailureVerified: true, mismatches: 1, predictionsUnchanged: true});
}
const fallback = run('external-fallback', {}, false); assert.equal(fallback.process.status, 1); assert(!fallback.report);
assert(fallback.process.stderr.includes('denied external stretch math')); save({name: 'external fallback', expectedFailureVerified: true});
for (const [name, key, edit] of [
  ['smoothing-source', 'preset', d => { d.decoded_tail.fields.find(r => r.object_offset === 0x458).value = .1; }],
  ['stiffness-source', 'controls', d => { d.stiffnessTable[69].stiffnessDouble *= 1.01; }],
  ['registry-weight-source', 'weights', d => { d.records[0].middle_weight = 1.5; }],
]) {
  const r = run(name, mutate(key, name, edit)); assert.equal(r.process.status, 1);
  const mismatches = r.report.checks.reduce((n, c) => n + c.mismatches, 0); assert(mismatches > 1);
  assert.notDeepEqual(r.report.predictedTable, baseline.report.predictedTable);
  save({name, expectedFailureVerified: true, mismatches, predictionsChanged: true});
}
const missing = run('missing-stiffness', mutate('controls', 'missing-stiffness', d => { d.stiffnessTable.pop(); }));
assert.equal(missing.process.status, 1); assert(!missing.report); save({name: 'missing computed stiffness', expectedFailureVerified: true});
for (const [key, file] of Object.entries(paths)) assert.equal(sha(fs.readFileSync(file)), original[key]);
