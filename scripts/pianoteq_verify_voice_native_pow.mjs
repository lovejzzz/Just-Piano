// Verify a completed native-pow voice replay and actual WAV artifacts.
// This does not launch Pianoteq or turn an observed-input component into stereo.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [root, reportPath, stems, directory, ...extra] = process.argv.slice(2);
if (!directory || extra.length) throw new Error('Usage: analysis-root native-report.json stems new-verification-directory');
fs.mkdirSync(directory);
const f = name => path.join(root, name), source = f('debug-pass110-tail-envelope-c/runtime.json');
const script = fileURLToPath(new URL('./pianoteq_replay_release_continuous_chain.mjs', import.meta.url));
const auditor = fileURLToPath(new URL('./pianoteq_audit_voice_tail_stems.py', import.meta.url));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const reportBytes = fs.readFileSync(reportPath), report = JSON.parse(reportBytes), manifest = JSON.parse(fs.readFileSync(path.join(stems, 'manifest.json')));
assert(report.passed && report.nativeDoublePowImplemented && !report.doublePowCandidateUsed && !report.powCandidateExplicit && report.computedTerminalSlopes);
assert.equal(report.checks, 14212052); assert.equal(report.powCalls.length, 5); assert.equal(manifest.files.length, 30);
assert.equal(report.finalStereoAudioVerified, false); assert.equal(manifest.finalStereo, false);
const original = {reportSha256: sha(reportBytes), captureSha256: sha(fs.readFileSync(source)), manifestSha256: sha(fs.readFileSync(path.join(stems, 'manifest.json')))};
function run(name, command, args) {
  const r = spawnSync(command, args, {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  fs.writeFileSync(path.join(directory, name + '-process.json'), JSON.stringify({command, args, status: r.status, signal: r.signal, error: r.error?.message, stdout: r.stdout, stderr: r.stderr}, null, 2) + '\n');
  assert.equal(r.signal, null); return r;
}
const view = new DataView(new ArrayBuffer(8));
const bits = x => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
const oracle = f('pass128-double-pow/pow-oracle');
const math = spawnSync(oracle, [], {input: report.powCalls.map(c => `${bits(c.input)} ${bits(c.exponent)}`).join('\n') + '\n', encoding: 'utf8'});
assert.equal(math.status, 0); assert.equal(math.signal, null);
assert.deepEqual(math.stdout.trim().split(/\s+/), report.powCalls.map(c => bits(c.output)));
fs.writeFileSync(path.join(directory, 'math-calibration.json'), JSON.stringify({calls: report.powCalls, systemWords: math.stdout.trim().split(/\s+/), mismatches: 0, oracleSha256: sha(fs.readFileSync(oracle))}, null, 2) + '\n');
const auditPath = path.join(directory, 'wav-audit.json'), audio = run('wav-audit', 'python3', [auditor, source, stems, auditPath]);
assert.equal(audio.status, 0); const audit = JSON.parse(fs.readFileSync(auditPath));
assert(audit.passed && audit.comparedFloat32Samples === 1272576 && audit.files === 30 && audit.finalStereo === false);
const wrapper = path.join(directory, 'deny-math-pow.mjs');
fs.writeFileSync(wrapper, "import {pathToFileURL} from 'node:url';const script=process.argv[2],args=process.argv.slice(3);process.argv=[process.execPath,script,...args];Math.pow=()=>{throw new Error('blocked Math.pow fallback')};await import(pathToFileURL(script).href);\n", {flag: 'wx'});
const fallbackReport = path.join(directory, 'fallback-report.json');
const fallback = run('candidate-fallback', process.execPath, [wrapper, script, source, fallbackReport, '--pow-candidate',
  '--archive-repeat-model=' + f('pass107-archive-repeat-source.json'), '--computed-terminal-slopes',
  '--resume-audit=' + f('debug-pass110-tail-envelope-c/owned-resumes.jsonl')]);
assert.equal(fallback.status, 1); assert(!fs.existsSync(fallbackReport)); assert(fallback.stderr.includes('blocked Math.pow fallback'));
const corrupt = path.join(directory, 'corrupt-stems'); fs.cpSync(stems, corrupt, {recursive: true, errorOnExist: true, force: false});
const file = path.join(corrupt, manifest.files[0].name), payload = fs.readFileSync(file);
assert.equal(payload.toString('ascii', 0, 4), 'RIFF'); let changed = false;
for (let offset = 12; offset + 8 <= payload.length;) {
  const size = payload.readUInt32LE(offset + 4);
  assert(offset + 8 + size <= payload.length);
  if (payload.toString('ascii', offset, offset + 4) === 'data') { assert(size > 0); payload[offset + 8] ^= 1; changed = true; break; }
  offset += 8 + size + (size & 1);
}
assert(changed); fs.writeFileSync(file, payload);
const corruptAudit = path.join(directory, 'corrupt-audit.json');
const corrupted = run('corrupt-wav', 'python3', [auditor, source, corrupt, corruptAudit]);
assert.equal(corrupted.status, 1); assert(!fs.existsSync(corruptAudit));
assert.equal(sha(fs.readFileSync(reportPath)), original.reportSha256);
assert.equal(sha(fs.readFileSync(source)), original.captureSha256);
assert.equal(sha(fs.readFileSync(path.join(stems, 'manifest.json'))), original.manifestSha256);
const result = {passed: true, completeVoiceChecks: report.checks, systemPowChecks: 5, actualFloat32WavSamples: audit.comparedFloat32Samples,
  files: 30, mathCandidateFallbackRejected: true, oneBitWavCorruptionRejected: true,
  originalHashes: original, finalStereoVerified: false, observedModelAndAudioInputsRemain: true};
fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
