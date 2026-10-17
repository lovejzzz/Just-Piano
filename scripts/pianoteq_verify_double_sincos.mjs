// Independent C system sincos comparison. Reuses preserved synthetic IEEE cases.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {nativeDoubleSinCos} from '../dsp/native-double-sincos.mjs';
const [priorPath, casesPath, oracle, directory, ...extra] = process.argv.slice(2);
if (!directory || extra.length) throw new Error('Usage: prior-impedance.json synthetic-inputs.json sincos-oracle new-directory');
const prior = JSON.parse(fs.readFileSync(priorPath)), sourceBytes = fs.readFileSync(casesPath), source = JSON.parse(sourceBytes);
const recorded = prior.oracleCalls?.filter(c => c.operation === 'sincos');
if (!prior.passed || !recorded?.length || !source.cases?.length) throw new Error('Complete prior sincos calls and synthetic cases required');
const cases = recorded.map(c => {
  if (c.inputs.length !== 1 || c.outputs.length !== 2) throw new Error('One argument / two results required');
  return {label: 'recorded-call', input: c.inputs[0], saved: c.outputs};
}).concat(source.cases.filter(c => c.label !== 'recorded-call').map(c => ({label: c.label, input: c.input})));
if (cases.some(c => !/^[0-9a-f]{16}$/.test(c.input))) throw new Error('Raw IEEE inputs required');
fs.mkdirSync(directory);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
fs.writeFileSync(path.join(directory, 'inputs.json'), JSON.stringify({syntheticSeed: source.seed, syntheticSourceSha256: sha(sourceBytes), cases}, null, 2) + '\n', {flag: 'wx'});
const input = cases.map(c => c.input).join('\n') + '\n';
const run = spawnSync(oracle, [], {input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
if (run.error || run.signal || run.status !== 0) throw new Error('Independent sincos oracle failed');
const outputs = run.stdout.trim().split('\n').map(line => line.trim().split(/\s+/));
if (outputs.length !== cases.length || outputs.some(row => row.length !== 2 || row.some(w => !/^[0-9a-f]{16}$/.test(w)))) throw new Error('Complete sin/cos result words required');
fs.writeFileSync(path.join(directory, 'system-results.txt'), run.stdout, {flag: 'wx'});
const view = new DataView(new ArrayBuffer(8));
const number = w => { view.setBigUint64(0, BigInt('0x' + w)); return view.getFloat64(0); };
const hex = x => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
let mismatches = 0, nanSemanticChecks = 0, savedCallMismatches = 0, mathCandidateMismatches = 0;
const groups = {}, failures = [];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i], x = number(c.input), predicted = nativeDoubleSinCos(x);
  const group = groups[c.label] ??= {inputs: 0, checks: 0, mismatches: 0};
  group.inputs++;
  for (const [lane, name] of ['sin', 'cos'].entries()) {
    const word = outputs[i][lane], target = number(word), nan = Number.isNaN(target);
    const bad = nan ? !Number.isNaN(predicted[name]) : hex(predicted[name]) !== word;
    group.checks++;
    if (nan) nanSemanticChecks++;
    else if (hex(name === 'sin' ? Math.sin(x) : Math.cos(x)) !== word) mathCandidateMismatches++;
    if (c.saved && c.saved[lane] !== word) savedCallMismatches++;
    if (bad) {
      mismatches++; group.mismatches++;
      if (failures.length < 40) failures.push({...c, lane: name, target: word, predicted: hex(predicted[name])});
    }
  }
}
const report = {passed: !mismatches && !savedCallMismatches, inputs: cases.length, checks: cases.length * 2, mismatches, savedCallMismatches, nanSemanticChecks, nanPayloadBitsNotClaimed: true, mathCandidateMismatches, groups, failures, inputSha256: sha(Buffer.from(input)), outputSha256: sha(Buffer.from(run.stdout)), oracleSha256: sha(fs.readFileSync(oracle)), systemMathOnly: true, newNativePianoCapture: false};
fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
