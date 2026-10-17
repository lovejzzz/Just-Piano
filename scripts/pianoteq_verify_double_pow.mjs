// Independent system pow validation: synthetic IEEE pairs plus saved replay calls.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {nativeDoublePow} from '../dsp/native-double-pow.mjs';
const [impedancePath, oracle, directory, ...extra] = process.argv.slice(2);
if (!directory || extra.length) throw new Error('Usage: prior-impedance.json pow-oracle new-directory');
const prior = JSON.parse(fs.readFileSync(impedancePath)), recorded = prior.oracleCalls?.filter(c => c.operation === 'pow');
if (!prior.passed || !recorded?.length) throw new Error('Complete prior pow calls required');
fs.mkdirSync(directory);
const view = new DataView(new ArrayBuffer(8)), floatView = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat64(0, x); return view.getBigUint64(0); };
const number = w => { view.setBigUint64(0, BigInt('0x' + w)); return view.getFloat64(0); };
const hex = x => bits(x).toString(16).padStart(16, '0');
const cases = [];
const addWords = (label, a, b, saved) => cases.push({label, inputs: [a, b].map(w => BigInt.asUintN(64, w).toString(16).padStart(16, '0')), saved});
const add = (label, x, y) => addWords(label, bits(x), bits(y));
for (const c of recorded) {
  if (c.inputs.length !== 2 || c.outputs.length !== 1) throw new Error('Two-input power call required');
  addWords('recorded-call', ...c.inputs.map(w => BigInt('0x' + w)), c.outputs[0]);
}
let seed = 128;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
const raw = () => (BigInt(random()) << 32n) | BigInt(random());
for (let i = 0; i < 20000; i++) addWords('random-IEEE-pairs', raw(), raw());
for (let i = 0; i < 20000; i++) add('ordinary', random() / 2 ** 30, (random() / 2 ** 32 - .5) * 32);
for (let i = 0; i < 20000; i++) addWords('positive-IEEE-quarter', raw() & 0x7fffffffffffffffn, bits(.25));
for (let i = 0; i < 20000; i++) {
  floatView.setUint32(0, random());
  add('float32-cube', floatView.getFloat32(0), 3);
}
for (let i = 0; i < 10000; i++) add('negative-integer', -random() / 2 ** 30, (random() % 2049) - 1024);
for (let i = 0; i < 10000; i++) addWords('subnormal-base', ((BigInt(random() & 0xfffff) << 32n) | BigInt(random())) || 1n, bits((random() / 2 ** 32 - .5) * 8));
for (let i = -4096; i <= 4096; i++) for (const y of [.25, 3, -(2 ** 63), 2 ** 63]) addWords('near-one', 0x3ff0000000000000n + BigInt(i), bits(y));
for (let e = -1074; e <= 1023; e++) for (const y of [.25, 3, -3, .0001]) add('power-of-two', 2 ** e, y);
const specials = [0, -0, 1, -1, 2, -2, .5, -.5, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, Infinity, -Infinity, NaN];
const exponents = [...specials, .25, 3, -3, 2 ** -65, -(2 ** -65), 2 ** -66, 2 ** 64, -(2 ** 64), 2 ** 65, 2 ** 53 - 1, -(2 ** 53 - 1)];
for (const x of specials) for (const y of exponents) add('special-grid', x, y);
for (const y of [-1075, -1074, -1022, 1023, 1024]) for (let i = -1024; i <= 1024; i++) addWords('range-boundary', bits(2), bits(y) + BigInt(i));
fs.writeFileSync(path.join(directory, 'inputs.json'), JSON.stringify({seed: 128, cases}, null, 2) + '\n', {flag: 'wx'});
const input = cases.map(c => c.inputs.join(' ')).join('\n') + '\n';
const run = spawnSync(oracle, [], {input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
if (run.error || run.signal || run.status !== 0) throw new Error('Independent pow oracle failed');
const outputs = run.stdout.trim().split(/\s+/);
if (outputs.length !== cases.length || outputs.some(w => !/^[0-9a-f]{16}$/.test(w))) throw new Error('Complete raw result words required');
fs.writeFileSync(path.join(directory, 'system-results.txt'), run.stdout, {flag: 'wx'});
let mismatches = 0, savedCallMismatches = 0, nanSemanticChecks = 0, mathCandidateMismatches = 0;
const groups = {}, failures = [];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i], [x, y] = c.inputs.map(number), target = number(outputs[i]), predicted = nativeDoublePow(x, y);
  const nan = Number.isNaN(target), bad = nan ? !Number.isNaN(predicted) : hex(predicted) !== outputs[i];
  if (nan) nanSemanticChecks++;
  else if (hex(Math.pow(x, y)) !== outputs[i]) mathCandidateMismatches++;
  if (c.saved && c.saved !== outputs[i]) savedCallMismatches++;
  const group = groups[c.label] ??= {checks: 0, mismatches: 0}; group.checks++;
  if (bad) { mismatches++; group.mismatches++; if (failures.length < 40) failures.push({...c, target: outputs[i], predicted: hex(predicted)}); }
}
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const report = {passed: !mismatches && !savedCallMismatches, checks: cases.length, mismatches, savedCallMismatches, nanSemanticChecks, nanPayloadBitsNotClaimed: true, mathCandidateMismatches, groups, failures, inputSha256: sha(Buffer.from(input)), outputSha256: sha(Buffer.from(run.stdout)), oracleSha256: sha(fs.readFileSync(oracle)), systemMathOnly: true, newNativePianoCapture: false};
fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
