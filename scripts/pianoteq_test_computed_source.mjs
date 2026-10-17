// Historical source bridge wiring checks. No native target is modified or launched.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {constructModalSource} from '../dsp/modal-source.mjs';
const [root, directory, ...extra] = process.argv.slice(2);
if (!directory || extra.length > 1 || extra.some(x => x !== '--with-amplitude-model')) throw new Error('Usage: analysis-root new-directory [--with-amplitude-model]');
const amplitudeModel = extra.includes('--with-amplitude-model');
fs.mkdirSync(directory);
const f = name => path.join(root, name), paths = {
  runtime: f('debug-pass14-modal-source/runtime.json'), archive: f('base-model-modal-inputs-pass13.json'),
  constants: f('debug-pass14-source-constants/runtime.json'), amplitude: f('debug-pass14-source-amplitude/runtime.json'),
  pow: f('debug-pass14-source-amplitude/pow-oracle/results.json'),
  poles: f('pass128-native-pow-poles-report.json'), weights: f('pass125-native-source-weights-report.json'),
};
if (amplitudeModel) { paths.archive = f('base-model-full-values-pass13.json'); paths.preset = f('dry-full-fxp-pass13.json'); }
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const original = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, sha(fs.readFileSync(file))]));
const script = fileURLToPath(new URL('./pianoteq_replay_modal_source.mjs', import.meta.url)), wrapper = path.join(directory, 'guard.mjs');
fs.writeFileSync(wrapper, "import {pathToFileURL} from 'node:url';const script=process.argv[2],args=process.argv.slice(3);process.argv=[process.execPath,script,...args];Math.pow=()=>{throw new Error('blocked Math.pow fallback')};await import(pathToFileURL(script).href);\n", {flag: 'wx'});
function run(name, overrides = {}, flags = true) {
  const folder = path.join(directory, name); fs.mkdirSync(folder);
  const p = {...paths, ...overrides}, output = path.join(folder, 'report.json');
  const args = [wrapper, script, p.runtime, p.archive, p.constants, p.amplitude, p.pow, output];
  if (flags) { args.push('--native-double-pow', '--poles-report', p.poles, '--weights-report', p.weights); if (amplitudeModel) args.push('--amplitude-preset', p.preset, '--amplitude-linear-curves'); }
  const r = spawnSync(process.execPath, args, {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  fs.writeFileSync(path.join(folder, 'process.json'), JSON.stringify({status: r.status, signal: r.signal, error: r.error?.message, stdout: r.stdout, stderr: r.stderr}, null, 2) + '\n');
  assert.equal(r.signal, null);
  return {process: r, report: fs.existsSync(output) ? JSON.parse(fs.readFileSync(output)) : undefined};
}
const baseline = run('baseline');
assert.equal(baseline.process.status, 0); assert(baseline.report.verifiedStagesPassed);
assert(baseline.report.frequencyAndRawDecayFromComputedPoles && baseline.report.harmonicWeightsFromComputedReport && baseline.report.powOracleComparisonOnly);
assert.equal(baseline.report.computedFrequencyBindings, 108); assert.equal(baseline.report.computedRawDecayBindings, 108);
assert.equal(baseline.report.computedWeightBindings, 70); assert.equal(baseline.report.computedPowCalls.length, 72);
if (amplitudeModel) { assert(baseline.report.sourceAmplitudeControlsFromArchives); assert.equal(baseline.report.amplitudeControlBindings, 8); assert.equal(baseline.report.amplitudeRegistryBindings, 6); }
assert.equal(baseline.report.nativePowDoubleMismatches, 0); assert.equal(baseline.report.unmatchedPowComparisonCalls, 0);
const results = [], view = new DataView(new ArrayBuffer(8));
const bits64 = x => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
const oracle = f('pass128-double-pow/pow-oracle');
const calibration = spawnSync(oracle, [], {input: baseline.report.computedPowCalls.map(c => `${bits64(c.base)} ${bits64(c.exponent)}`).join('\n') + '\n', encoding: 'utf8'});
assert.equal(calibration.status, 0); assert.equal(calibration.signal, null);
assert.deepEqual(calibration.stdout.trim().split(/\s+/), baseline.report.computedPowCalls.map(c => c.resultBits));
fs.writeFileSync(path.join(directory, 'math-calibration.json'), JSON.stringify({calls: 72, mismatches: 0, oracleSha256: sha(fs.readFileSync(oracle)), systemResults: calibration.stdout.trim().split(/\s+/)}, null, 2) + '\n');
if (amplitudeModel) {
  const systemOracle = f('pass123-system-math-oracle'), etaCalls = [];
  for (const control of baseline.report.amplitudeControlPredictions) {
    assert(control.expfCalled);
    const r = spawnSync(systemOracle, ['expf', bits64(control.expfInput)], {encoding: 'utf8'});
    assert.equal(r.status, 0); assert.equal(r.signal, null);
    assert.equal(r.stdout.trim(), bits64(control.eta));
    etaCalls.push({input: bits64(control.expfInput), result: r.stdout.trim()});
  }
  fs.writeFileSync(path.join(directory, 'eta-calibration.json'), JSON.stringify({calls: etaCalls, uniqueInputs: new Set(etaCalls.map(c => c.input)).size,
    mismatches: 0, oracleSha256: sha(fs.readFileSync(systemOracle))}, null, 2) + '\n');
}
const runtime = JSON.parse(fs.readFileSync(paths.runtime)), amplitude = JSON.parse(fs.readFileSync(paths.amplitude));
const constants = JSON.parse(fs.readFileSync(paths.constants)).records[0];
const weights = JSON.parse(fs.readFileSync(paths.weights)).predictions;
const originalMathPow = Math.pow;
try {
  Math.pow = () => { throw new Error('Default builder must not use Math.pow'); };
  for (const prediction of baseline.report.predictions) {
    const record = runtime.records.find(r => r.note_index === prediction.noteIndex && r.mode === prediction.mode);
    const input = amplitude.records.find(r => r.frequency.rows === prediction.rows && r.frequency.cols === prediction.cols);
    const harmonicWeights = weights.find(r => r.note === prediction.note && r.noteIndex === prediction.noteIndex).values;
    const built = constructModalSource({frequency: prediction.frequency, rawDecay: prediction.rawDecay, weights: harmonicWeights,
      columns: prediction.cols, ...(amplitudeModel ? baseline.report.amplitudeControlPredictions.find(r => r.recordIndex === runtime.records.indexOf(record)) : {addedDecay: input.added_decay, shape: input.shape, eta: input.eta}),
      integerScale: constants.integer_amplitude_scale, phaseAmount: record.cache_controls['0x158'],
      phaseConstant: constants.phase_constant, referenceFrequency: record.G_controls['0x78']});
    for (const name of ['frequency', 'rawDecay', 'decay', 'amplitude', 'phase', 'normalizedAmplitude'])
      assert.deepEqual(Array.from(built[name]), prediction[name]);
    assert.equal(built.referenceIndex, prediction.referenceIndex);
  }
} finally { Math.pow = originalMathPow; }
const powPredictions = r => r.computedPowCalls.map(({base, exponent, result, resultBits}) => ({base, exponent, result, resultBits}));
function save(result) {
  results.push(result);
  fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({baseline: {passed: true, frequencyBindings: 108, rawDecayBindings: 108, weightBindings: 70, powCalls: 72, systemPowMismatches: 0, defaultBuilderMatchesReplayWithoutMathPow: true, amplitudeModelControlsComputed: amplitudeModel}, originalHashes: original, results}, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
function mutate(key, name, edit) {
  const data = JSON.parse(fs.readFileSync(paths[key])); edit(data);
  const file = path.join(directory, name + '.json'); fs.writeFileSync(file, JSON.stringify(data) + '\n', {flag: 'wx'});
  return {[key]: file};
}
const word32 = x => { view.setFloat32(0, x); view.setUint32(0, view.getUint32(0) ^ 1); return view.getFloat32(0); };
for (const [name, key, edit] of [
  ['raw-decay-comparison', 'amplitude', d => { d.records[0].raw_decay.values[0] = word32(d.records[0].raw_decay.values[0]); }],
  ['weight-comparison', 'amplitude', d => { d.records[0].weights[0] = word32(d.records[0].weights[0]); }],
  ['amplitude-target', 'runtime', d => { d.records[0].matrices['0x60'].values[0] = word32(d.records[0].matrices['0x60'].values[0]); }],
  ['pow-comparison', 'pow', d => {
    const row = d.records[0]; view.setFloat64(0, row.result); view.setBigUint64(0, view.getBigUint64(0) ^ 1n);
    row.result = view.getFloat64(0); row.result_bits = view.getBigUint64(0).toString(16).padStart(16, '0');
  }],
  ['missing-pow-comparison', 'pow', d => { d.records.shift(); }],
  ...(amplitudeModel ? [
    ['eta-comparison', 'amplitude', d => { d.records[0].eta *= .5; }],
    ['shape-db-comparison', 'amplitude', d => { d.records[0].shape_db += 1; }],
    ['registry-db-comparison', 'runtime', d => { d.records[0].cache_controls['0x188'] += 1; }],
  ] : []),
]) {
  const r = run(name, mutate(key, name, edit));
  assert.equal(r.process.status, 1); assert.equal(r.report.failures.length, 1);
  assert.deepEqual(r.report.predictions, baseline.report.predictions);
  assert.deepEqual(powPredictions(r.report), powPredictions(baseline.report));
  save({name, expectedFailureVerified: true, failures: 1, allPredictionsUnchanged: true});
}
for (const [name, key, edit] of [
  ['upstream-weight-source', 'weights', d => { d.predictions[0].values[0] *= 1.25; }],
  ...(amplitudeModel ? [['preset-amplitude-source', 'preset', d => { d.decoded_tail.fields.find(r => r.object_offset === 0x470).value.b *= .9; }]] : [['amplitude-model-control', 'amplitude', d => { d.records[0].eta *= .5; }]]),
]) {
  const r = run(name, mutate(key, name, edit));
  assert.equal(r.process.status, 1); assert(r.report.failures.length > 1);
  assert.notDeepEqual(r.report.predictions, baseline.report.predictions);
  save({name, expectedFailureVerified: true, failures: r.report.failures.length, predictionsChanged: true});
}
for (const [name, key, edit] of [
  ['missing-pole-row', 'poles', d => { d.checks.pop(); }],
  ['duplicate-weight-row', 'weights', d => { d.predictions.push(d.predictions[0]); }],
]) {
  const r = run(name, mutate(key, name, edit));
  assert.equal(r.process.status, 1); assert(!r.report);
  save({name, expectedFailureVerified: true, incompleteBridgeRejected: true});
}
const candidate = run('legacy-fallback', {}, false);
assert.equal(candidate.process.status, 1); assert(!candidate.report);
assert(candidate.process.stderr.includes('blocked Math.pow fallback'));
save({name: 'legacy fallback', expectedFailureVerified: true});
for (const [key, file] of Object.entries(paths)) assert.equal(sha(fs.readFileSync(file)), original[key]);
