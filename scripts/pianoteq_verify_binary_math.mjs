// Independent system exp2/log2 validation, synthetic IEEE inputs and replay calls.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {nativeDoubleExp2} from '../dsp/native-double-exp2.mjs';
import {nativeDoubleLog2} from '../dsp/native-double-log2.mjs';
const [controlsPath, tuningPath, operation, oracle, directory, ...extra] = process.argv.slice(2);
if (!directory || extra.length || !['exp2', 'log2'].includes(operation)) throw new Error('Usage: controls-report tuning-report exp2|log2 oracle new-directory');
const controls = JSON.parse(fs.readFileSync(controlsPath)), tuning = JSON.parse(fs.readFileSync(tuningPath));
if (!controls.passed || !tuning.passed || !controls.oracleCalls?.length || !tuning.oracleCalls?.length) throw new Error('Complete prior reports required');
fs.mkdirSync(directory);
const v = new DataView(new ArrayBuffer(8));
const bits = x => { v.setFloat64(0, x); return v.getBigUint64(0); };
const number = w => { v.setBigUint64(0, BigInt('0x' + w)); return v.getFloat64(0); };
const hex = x => bits(x).toString(16).padStart(16, '0');
const cases = [], prior = new Map();
for (const c of controls.oracleCalls.filter(c => c.operation === operation)) {
  if (c.inputBits.length !== 1) throw new Error('One-input math call required');
  prior.set(c.inputBits[0], c.outputBits);
}
for (const c of tuning.oracleCalls.filter(c => c.name === operation)) {
  if (prior.has(c.input) && prior.get(c.input) !== c.output) throw new Error('Conflicting prior math calls');
  prior.set(c.input, c.output);
}
if (!prior.size) throw new Error('No prior calls for operation');
const addWord = (label, w, saved) => cases.push({label, input: BigInt.asUintN(64, w).toString(16).padStart(16, '0'), saved});
const add = (label, x) => addWord(label, bits(x));
for (const [input, saved] of prior) addWord('recorded-call', BigInt('0x' + input), saved);
let seed = 132; const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
for (let i = 0; i < 20000; i++) add('audio-range', operation === 'exp2' ? random() / 2 ** 32 * 24 - 12 : random() / 2 ** 31 + .000001);
for (let i = 0; i < 20000; i++) addWord('random-IEEE', (BigInt(random()) << 32n) | BigInt(random()));
if (operation === 'exp2') {
  for (let i = 0; i < 20000; i++) add('full-result-range', random() / 2 ** 32 * 2150 - 1100);
  for (const x of [-1088, -1075, -1074, -1022, 1024]) for (let step = -2048; step <= 2048; step++) addWord('range-boundary', bits(x) + BigInt(step));
  for (let i = 0; i < 4096; i++) {
    const word = bits(((random() % 270000) - 138000) / 128);
    for (let step = -2; step <= 2; step++) addWord('reduction-boundary', word + BigInt(step));
  }
} else {
  for (let i = 0; i < 20000; i++) addWord('positive-IEEE', ((BigInt(random()) << 32n) | BigInt(random())) & 0x7fffffffffffffffn);
  for (let i = 0; i < 10000; i++) addWord('subnormal', ((BigInt(random() & 0xfffff) << 32n) | BigInt(random())) || 1n);
  for (let step = -4096; step <= 4096; step++) addWord('near-one', 0x3ff0000000000000n + BigInt(step));
  for (const e of [-1000, -100, -1, 0, 1, 100, 1000]) for (let j = 0; j < 128; j++) {
    const word = bits((1 + (j + .5) / 128) * 2 ** e);
    for (let step = -2; step <= 2; step++) addWord('table-boundary', word + BigInt(step));
  }
}
for (const word of [0n, 0x8000000000000000n, 1n, 0x8000000000000001n, 0x000fffffffffffffn, 0x0010000000000000n, 0x7fefffffffffffffn, 0xffefffffffffffffn, 0x7ff0000000000000n, 0xfff0000000000000n, 0x7ff8000000000001n, 0xfff0000000000001n, 0x7ff0000000000001n]) addWord('special', word);
const input = cases.map(c => c.input).join('\n') + '\n';
fs.writeFileSync(path.join(directory, 'inputs.json'), JSON.stringify({seed: 132, operation, cases}, null, 2) + '\n', {flag: 'wx'});
const run = spawnSync(oracle, [operation], {input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
if (run.error || run.signal || run.status !== 0) throw new Error('System oracle failed');
const outputs = run.stdout.trim().split(/\s+/);
if (outputs.length !== cases.length || outputs.some(w => !/^[0-9a-f]{16}$/.test(w))) throw new Error('Complete raw system results required');
fs.writeFileSync(path.join(directory, 'system-results.txt'), run.stdout, {flag: 'wx'});
let mismatches = 0, savedCallMismatches = 0, nanSemanticChecks = 0, mathCandidateMismatches = 0;
const groups = {}, failures = [];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i], x = number(c.input), target = number(outputs[i]);
  const predicted = operation === 'exp2' ? nativeDoubleExp2(x) : nativeDoubleLog2(x);
  const nan = Number.isNaN(target), bad = nan ? !Number.isNaN(predicted) : hex(predicted) !== outputs[i];
  if (nan) nanSemanticChecks++;
  else if (hex(operation === 'exp2' ? 2 ** x : Math.log2(x)) !== outputs[i]) mathCandidateMismatches++;
  if (c.saved && c.saved !== outputs[i]) savedCallMismatches++;
  const group = groups[c.label] ??= {checks: 0, mismatches: 0}; group.checks++;
  if (bad) { mismatches++; group.mismatches++; if (failures.length < 40) failures.push({...c, target: outputs[i], predicted: hex(predicted)}); }
}
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const report = {passed: !mismatches && !savedCallMismatches, operation, checks: cases.length, mismatches, savedCallMismatches, nanSemanticChecks, nanPayloadBitsNotClaimed: true, mathCandidateMismatches, groups, failures, inputSha256: sha(Buffer.from(input)), outputSha256: sha(Buffer.from(run.stdout)), oracleSha256: sha(fs.readFileSync(oracle)), systemMathOnly: true, newNativePianoCapture: false};
fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'}); console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
