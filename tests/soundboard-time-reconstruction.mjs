import assert from 'node:assert/strict';
import {reconstructSoundboardTime} from '../dsp/soundboard-time-reconstruction.mjs';
import {nativeScalarExp} from '../dsp/native-scalar-exp.mjs';
const f = Math.fround;
function fixture(span, start = 0) {
  const input = new Float32Array(span + start + 5);
  input.fill(1, start, start + span);
  const inverseInput = new Float32Array(16384), inverseOutput = new Float32Array(16384);
  inverseOutput.fill(16384, 0, span);
  return {input, prefix: {length: 16384, start, end: start + span}, inverse: {inverseInput, inverseOutput}};
}
const {input, prefix, inverse} = fixture(100, 3), original = input.slice();
const result = reconstructSoundboardTime(input, prefix, inverse);
assert.deepEqual(input, original);
assert.equal(result.window, 10);
assert.deepEqual(result.headTailSums, [10, 9, 10, 9]); // Tail starts at the zero padding word.
assert.equal(result.decayRatio, 1);
assert.ok(result.weights.every((v) => v === 1));
assert.deepEqual(result.output.subarray(0, 3), new Float32Array(3));
assert.deepEqual(result.output.subarray(103), new Float32Array(5));
assert.equal(result.core[89], result.core[0]); // First fade sample has exponent zero.
assert.equal(result.core[99], f(nativeScalarExp(-f(2.3025851)) * result.gain));
const short = fixture(10, 1);
assert.deepEqual(reconstructSoundboardTime(short.input, short.prefix, short.inverse).output, short.input);
assert.throws(() => reconstructSoundboardTime(input, {...prefix, end: input.length + 1}, inverse), /span/);
assert.throws(() => reconstructSoundboardTime(input, prefix,
  {...inverse, inverseOutput: new Float32Array(16384)}), /decay ratio/);
assert.throws(() => reconstructSoundboardTime(input, {...prefix, length: 128}, inverse), /FFT16384/);
console.log('PASS reconstruction tail indexing, quartic unity weights, fade, gain, short branch and guards');
