// Own-process fallback guard and preserved-capture perturbations, no target writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [capture, oracle, directory, ...extra] = process.argv.slice(2);
if (!directory || extra.length) throw new Error('Usage: merged-capture.json pow-oracle new-directory');
fs.mkdirSync(directory);
const script = fileURLToPath(new URL('./pianoteq_replay_release_merged_chain.mjs', import.meta.url));
const original = fs.readFileSync(capture), sha = b => crypto.createHash('sha256').update(b).digest('hex');
const wrapper = path.join(directory, 'guard.mjs');
fs.writeFileSync(wrapper, "import {pathToFileURL} from 'node:url';const script=process.argv[2],args=process.argv.slice(3);process.argv=[process.execPath,script,...args];Math.pow=()=>{throw new Error('blocked Math.pow fallback')};await import(pathToFileURL(script).href);\n", {flag: 'wx'});
function run(name, input = capture, option = '--native-double-pow') {
  const folder = path.join(directory, name); fs.mkdirSync(folder);
  const output = path.join(folder, 'report.json');
  const processResult = spawnSync(process.execPath, [wrapper, script, input, output, option], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  fs.writeFileSync(path.join(folder, 'process.json'), JSON.stringify({status: processResult.status, signal: processResult.signal, error: processResult.error?.message, stdout: processResult.stdout, stderr: processResult.stderr}, null, 2) + '\n');
  assert.equal(processResult.signal, null);
  return {process: processResult, report: fs.existsSync(output) ? JSON.parse(fs.readFileSync(output)) : undefined};
}
const baseline = run('baseline');
assert.equal(baseline.process.status, 0);
assert(baseline.report.passed && baseline.report.nativeDoublePowImplemented && !baseline.report.doublePowCandidateUsed);
assert.equal(baseline.report.checks, 18279); assert.equal(baseline.report.powCalls.length, 5);
const view = new DataView(new ArrayBuffer(8));
const bits = x => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
const calls = baseline.report.powCalls;
const calibration = spawnSync(oracle, [], {input: calls.map(c => `${bits(c.input)} ${bits(c.exponent)}`).join('\n') + '\n', encoding: 'utf8'});
assert.equal(calibration.status, 0); assert.equal(calibration.signal, null);
assert.deepEqual(calibration.stdout.trim().split(/\s+/), calls.map(c => bits(c.output)));
fs.writeFileSync(path.join(directory, 'math-calibration.json'), JSON.stringify({calls, systemWords: calibration.stdout.trim().split(/\s+/), oracleSha256: sha(fs.readFileSync(oracle))}, null, 2) + '\n');
const results = [];
function save(result) {
  results.push(result);
  fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({baseline: {passed: true, checks: 18279, powCalls: 5, systemMathMismatches: 0}, sourceSha256: sha(original), results}, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
const fallback = run('candidate-fallback', capture, '--pow-candidate');
assert.equal(fallback.process.status, 1); assert(!fallback.report);
assert(fallback.process.stderr.includes('blocked Math.pow fallback'));
save({name: 'candidate fallback', expectedFailureVerified: true});
const changedTarget = JSON.parse(original), row = changedTarget.records.find(r => r.stage === 'phased');
view.setFloat32(0, row.feedbackGain); view.setUint32(0, view.getUint32(0) ^ 1); row.feedbackGain = view.getFloat32(0);
const targetPath = path.join(directory, 'changed-target.json'); fs.writeFileSync(targetPath, JSON.stringify(changedTarget) + '\n', {flag: 'wx'});
const target = run('comparison-target', targetPath);
assert.equal(target.process.status, 1); assert.equal(target.report.mismatches, 1);
assert.deepEqual(target.report.powCalls, calls);
save({name: 'feedback comparison target', expectedFailureVerified: true, mismatches: 1, powPredictionsUnchanged: true});
const changedSource = JSON.parse(original), input = changedSource.records.find(r => r.stage === 'weights' && r.input.mode === 0);
input.postInputs.amplitudeGain *= 1.25;
const sourcePath = path.join(directory, 'changed-source.json'); fs.writeFileSync(sourcePath, JSON.stringify(changedSource) + '\n', {flag: 'wx'});
const source = run('source-control', sourcePath);
assert.equal(source.process.status, 1); assert(source.report.mismatches > 1);
save({name: 'post amplitude source', expectedFailureVerified: true, mismatches: source.report.mismatches});
assert.equal(sha(fs.readFileSync(capture)), sha(original));
