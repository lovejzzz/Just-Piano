// Independent system tan comparison; no piano process attachment.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {nativeDoubleTan} from '../dsp/native-double-tan.mjs';
const [priorPath, oracle, directory, ...extra] = process.argv.slice(2);
if (!directory || extra.length) throw new Error('Usage: prior-impedance.json tan-oracle new-directory');
const prior = JSON.parse(fs.readFileSync(priorPath));
const recorded = prior.oracleCalls?.filter(c => c.operation === 'tan');
if (!prior.passed || !recorded?.length) throw new Error('Complete prior tan calls required');
fs.mkdirSync(directory);
const view = new DataView(new ArrayBuffer(8));
const bits = x => { view.setFloat64(0, x); return view.getBigUint64(0); };
const number = w => { view.setBigUint64(0, BigInt('0x' + w)); return view.getFloat64(0); };
const hex = x => bits(x).toString(16).padStart(16, '0');
const cases = [];
const addWord = (label, word, saved) => cases.push({label, input: BigInt.asUintN(64, word).toString(16).padStart(16, '0'), saved});
const add = (label, x) => addWord(label, bits(x));
for (const c of recorded) {
  if (c.inputs.length !== 1 || c.outputs.length !== 1) throw new Error('One-input math call required');
  addWord('recorded-call', BigInt('0x' + c.inputs[0]), c.outputs[0]);
}
let seed = 126;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
for (let i = 0; i < 20000; i++) add('ordinary-angle', (random() / 2 ** 32 - .5) * 16);
for (let i = 0; i < 20000; i++) add('medium-angle', (random() / 2 ** 32 - .5) * 1048576);
for (let i = 0; i < 30000; i++) addWord('random-IEEE', (BigInt(random()) << 32n) | BigInt(random()));
for (let i = 0; i < 10000; i++) {
  const w = (BigInt(random() & 0xfffff) << 32n) | BigInt(random());
  addWord('subnormal', i & 1 ? w | 0x8000000000000000n : w);
}
for (const center of [Math.PI / 4, Math.PI / 2, Math.PI, 524288.6169851497])
  for (let step = -2048; step <= 2048; step++) {
    const w = bits(center) + BigInt(step);
    addWord('reduction-boundary', w);
    addWord('reduction-boundary', w | 0x8000000000000000n);
  }
// Huge reduction uses exponent/64 to select limbs; cover every exponent and sign.
for (let exponent = 19; exponent <= 1023; exponent++) for (let j = 0; j < 8; j++) {
  const w = (BigInt(exponent + 1023) << 52n) | (BigInt(random() & 0xfffff) << 32n) | BigInt(random());
  addWord('huge-exponents', w);
  addWord('huge-exponents', w | 0x8000000000000000n);
}
for (const w of [0n, 0x8000000000000000n, 1n, 0x8000000000000001n, 0x000fffffffffffffn, 0x0010000000000000n, 0x7fefffffffffffffn, 0xffefffffffffffffn, 0x7ff0000000000000n, 0xfff0000000000000n, 0x7ff8000000000001n, 0x7ff0000000000001n]) addWord('special', w);
fs.writeFileSync(path.join(directory, 'inputs.json'), JSON.stringify({seed: 126, cases}, null, 2) + '\n', {flag: 'wx'});
const input = cases.map(c => c.input).join('\n') + '\n';
const run = spawnSync(oracle, [], {input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
if (run.error || run.signal || run.status !== 0) throw new Error('Independent tan oracle failed');
const outputs = run.stdout.trim().split(/\s+/);
if (outputs.length !== cases.length || outputs.some(w => !/^[0-9a-f]{16}$/.test(w))) throw new Error('Incomplete oracle words');
fs.writeFileSync(path.join(directory, 'system-results.txt'), run.stdout, {flag: 'wx'});
let mismatches = 0, savedCallMismatches = 0, nanSemanticChecks = 0, mathCandidateMismatches = 0;
const groups = {}, failures = [];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i], x = number(c.input), target = number(outputs[i]), predicted = nativeDoubleTan(x);
  const nan = Number.isNaN(target), bad = nan ? !Number.isNaN(predicted) : hex(predicted) !== outputs[i];
  if (nan) nanSemanticChecks++;
  else if (hex(Math.tan(x)) !== outputs[i]) mathCandidateMismatches++;
  if (c.saved && c.saved !== outputs[i]) savedCallMismatches++;
  const group = groups[c.label] ??= {checks: 0, mismatches: 0};
  group.checks++;
  if (bad) {
    mismatches++; group.mismatches++;
    if (failures.length < 40) failures.push({...c, target: outputs[i], predicted: hex(predicted)});
  }
}
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const report = {passed: !mismatches && !savedCallMismatches, checks: cases.length, mismatches, savedCallMismatches, nanSemanticChecks, nanPayloadBitsNotClaimed: true, mathCandidateMismatches, groups, failures, inputSha256: sha(Buffer.from(input)), outputSha256: sha(Buffer.from(run.stdout)), oracleSha256: sha(fs.readFileSync(oracle)), systemMathOnly: true, newNativePianoCapture: false};
fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
