import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {nativeScalarAtan2f} from '../dsp/native-scalar-atan2.mjs';
const [oracle, output] = process.argv.slice(2);
if (!oracle || !output) throw new Error('System bulk oracle and new output path required');
const pairs = new Map(), word = new DataView(new ArrayBuffer(4));
const hex = x => (x >>> 0).toString(16).padStart(8, '0');
const from = x => {word.setUint32(0, x); return word.getFloat32(0);};
const bits = x => {word.setFloat32(0, x); return word.getUint32(0);};
const add = (a,b) => pairs.set(`${hex(a)} ${hex(b)}`, [a >>> 0, b >>> 0]);
const edges = [0,1,2,3,4,0x007ffffe,0x007fffff,0x00800000,0x00800001,0x3effffff,0x3f000000,
  0x3f7fffff,0x3f800000,0x3f800001,0x40000000,0x40400000,0x40800000,
  0x7f000000,0x7f7ffffe,0x7f7fffff,0x7f800000,0x7fc00000,0x7f800001,0x7fffffff];
for (const a of edges) for (const b of edges) for (const signA of [0,0x80000000]) for (const signB of [0,0x80000000]) add(a ^ signA,b ^ signB);
for (let e = 1; e < 255; e++) for (const m of [-1,0,1,0x3fffff,0x7fffff]) {
  const a = ((e << 23) + m) >>> 0;
  for (const b of [1,0x007fffff,a,(a+1)>>>0,0x3f800000,0x7f7fffff]) add(a,b);
}
// Diagonal and near-zero negative-X transitions, including the native cutoff.
for (let e=1; e<255; e++) {
  const x=(e<<23)>>>0;
  for (const d of [-1,0,1]) {add((x+d)>>>0,x); add(((x+d)^0x80000000)>>>0,x); add((x+d)>>>0,x^0x80000000);}
}
for (const y of [0,1,0x337fffff,0x33800000,0x33800001,0x347fffff,0x34800000,0x34800001]) {
  add(y,0xbf800000); add(y^0x80000000,0xbf800000);
}
let seed = 143;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0;};
for (let i = 0; i < 120000; i++) add(random(),random());
const input = [...pairs.keys()].join('\n') + '\n';
const result = spawnSync(oracle, ['atan2f-bulk'], {input, encoding:'utf8', maxBuffer:16*1024*1024});
if (result.status !== 0 || result.stderr || !/^(?:[0-9a-f]{8}\n)+$/.test(result.stdout)) throw new Error('System bulk oracle failed');
const actual = result.stdout.trim().split('\n');
if (actual.length !== pairs.size) throw new Error('Incomplete system comparison');
const failures = []; let compared = 0, nanSemantic = 0, mismatches = 0;
for (const [i,[a,b]] of [...pairs.values()].entries()) {
  const predicted = nativeScalarAtan2f(from(a),from(b)), target = parseInt(actual[i],16);
  if (Number.isNaN(from(target))) {nanSemantic++; if (!Number.isNaN(predicted)) mismatches++;}
  else {compared++; if (bits(predicted) !== target) {mismatches++; if (failures.length < 30) failures.push({a:hex(a),b:hex(b),predicted:hex(bits(predicted)),actual:hex(target)});}}
}
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const report = {passed:mismatches===0, inputs:pairs.size, comparedBitwise:compared, nanSemantic, mismatches, failures,
  oracleSha256:sha(fs.readFileSync(oracle)), inputSha256:sha(input), outputSha256:sha(result.stdout),
  nanPayloadsAndExceptionFlagsModeled:false, allInputPairsExhaustivelyTested:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(report);
if (!report.passed) process.exitCode=1;
