// Actual preserved source/tuning records; no target process modifications.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [root, directory, ...extra] = process.argv.slice(2);
if (!directory || extra.length) throw new Error('Usage: analysis-root new-directory');
fs.mkdirSync(directory);
const f = name => path.join(root, name), sourceScript = fileURLToPath(new URL('./pianoteq_replay_source_controls.mjs', import.meta.url));
const tuningScript = fileURLToPath(new URL('./pianoteq_replay_tuning.mjs', import.meta.url));
const paths = {base: f('base-model-full-values-pass13.json'), preset: f('dry-full-fxp-pass13.json'),
  source: f('debug-pass14-modal-source/runtime.json'), other: f('debug-pass16-coupling-inputs-note70/runtime.json'),
  final: f('debug-pass17-tuning/runtime.json'), stretched: f('debug-pass17-stretched/runtime.json'), anchor: f('debug-pass17-anchor/runtime.json')};
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const original = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, sha(fs.readFileSync(file))]));
const denied = path.join(directory, 'denied-oracle');
fs.writeFileSync(denied, '#!/bin/sh\necho "denied external source math" >&2\nexit 93\n', {mode: 0o755, flag: 'wx'});
function run(name, kind, overrides = {}, native = true) {
  const folder = path.join(directory, name); fs.mkdirSync(folder);
  const p = {...paths, ...overrides}, report = path.join(folder, 'report.json');
  const args = kind === 'controls' ? [sourceScript, p.base, p.preset, denied, p.source, report, '--additional-capture', p.other, '--tuning-capture', p.final]
    : [tuningScript, p.base, p.preset, p.final, p.stretched, p.anchor, denied, report];
  if (native) args.push('--native-math');
  const r = spawnSync(process.execPath, args, {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  fs.writeFileSync(path.join(folder, 'process.json'), JSON.stringify({status: r.status, signal: r.signal, error: r.error?.message, stdout: r.stdout, stderr: r.stderr}, null, 2) + '\n');
  assert.equal(r.signal, null);
  return {process: r, report: fs.existsSync(report) ? JSON.parse(fs.readFileSync(report)) : undefined};
}
const controls = run('controls-baseline', 'controls'), tuning = run('tuning-baseline', 'tuning');
for (const r of [controls, tuning]) { assert.equal(r.process.status, 0); assert(r.report.passed && r.report.recoveredNativeMathImplemented); assert.equal(r.report.oracleUniqueCalls, 0); assert.equal(r.report.oracleCalls.length, 0); }
assert.equal(controls.report.comparedValues, 1841); assert.equal(controls.report.nativeDoubleValues, 128);
assert.equal(controls.report.nativeDoubleMismatches, 0); assert.equal(controls.report.computedMathCalls.length, 284);
assert.equal(tuning.report.floatValues, 2520); assert.equal(tuning.report.uniqueNotes, 105);
assert.equal(tuning.report.computedMathCalls.length, 280); assert.equal(tuning.report.nativeMathOracleRequired, false);
for (const [report, oldPath, kind] of [[controls.report, f('debug-pass17-tuning/source-controls-complete.json'), 'controls'], [tuning.report, f('debug-pass17-tuning/tuning-replay.json'), 'tuning']]) {
  const old = JSON.parse(fs.readFileSync(oldPath)); assert(old.passed);
  if (kind === 'controls') { assert.deepEqual(report.stiffnessTable, old.stiffnessTable); assert.deepEqual(report.computedMathCalls, old.oracleCalls); }
  else { assert.deepEqual(report.predictedSources, old.predictedSources); assert.deepEqual(report.computedMathCalls, old.oracleCalls); }
}
const results = [];
function save(row) {
  results.push(row); fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({baseline: {controls: 1841, stiffnessDoubles: 128, tuning: 2520, uniqueNotes: 105, externalMathCalls: 0, computedCalls: 564, allPriorMathWordsUnchanged: true}, originalHashes: original, results}, null, 2) + '\n');
  console.log(JSON.stringify(row));
}
function mutate(key, name, edit) {
  const data = JSON.parse(fs.readFileSync(paths[key])); edit(data);
  const file = path.join(directory, name + '.json'); fs.writeFileSync(file, JSON.stringify(data) + '\n', {flag: 'wx'});
  return {[key]: file};
}
for (const kind of ['controls', 'tuning']) {
  const r = run(kind + '-no-native', kind, {}, false);
  assert.equal(r.process.status, 1); assert(!r.report); assert(r.process.stderr.includes('denied external source math'));
  save({name: kind + ' external fallback', expectedFailureVerified: true});
}
const v = new DataView(new ArrayBuffer(4));
const flip = x => { v.setFloat32(0, x); v.setUint32(0, v.getUint32(0) ^ 1); return v.getFloat32(0); };
for (const [kind, key, field, baseline] of [['controls', 'source', '0x28', controls.report], ['tuning', 'final', '0x78', tuning.report]]) {
  const r = run(kind + '-target', kind, mutate(key, kind + '-target', d => { d.records[0].G_controls[field] = flip(d.records[0].G_controls[field]); }));
  assert.equal(r.process.status, 1); assert.equal(r.report.failures.length, 1);
  assert.deepEqual(r.report.computedMathCalls, baseline.computedMathCalls);
  if (kind === 'controls') { assert.deepEqual(r.report.stiffnessTable, baseline.stiffnessTable); assert.deepEqual(r.report.checks.map(c => c.prediction), baseline.checks.map(c => c.prediction)); }
  else assert.deepEqual(r.report.predictedSources, baseline.predictedSources);
  save({name: kind + ' comparison target', expectedFailureVerified: true, mismatches: 1, predictionsUnchanged: true});
}
const changedControls = run('stiffness-source', 'controls', mutate('preset', 'stiffness-source', d => { d.decoded_tail.fields.find(r => r.object_offset === 0xf40).value *= .9; }));
assert.equal(changedControls.process.status, 1); assert(changedControls.report.failures.length > 1);
assert.notDeepEqual(changedControls.report.stiffnessTable, controls.report.stiffnessTable);
save({name: 'stiffness preset source', expectedFailureVerified: true, mismatches: changedControls.report.failures.length, predictionsChanged: true});
const changedTuning = run('stretch-source', 'tuning', mutate('stretched', 'stretch-source', d => { d.configurations[0].stretch_table[70] *= 1.001; }));
assert.equal(changedTuning.process.status, 1); assert(changedTuning.report.failures.length > 1);
assert.notDeepEqual(changedTuning.report.predictedSources, tuning.report.predictedSources);
save({name: 'remaining observed stretch source', expectedFailureVerified: true, mismatches: changedTuning.report.failures.length, predictionsChanged: true});
const missing = run('missing-final', 'tuning', mutate('final', 'missing-final', d => { d.records.pop(); }));
assert.equal(missing.process.status, 1); assert(!missing.report);
save({name: 'missing tuning traversal', expectedFailureVerified: true, incompleteCaptureRejected: true});
for (const [key, file] of Object.entries(paths)) assert.equal(sha(fs.readFileSync(file)), original[key]);
