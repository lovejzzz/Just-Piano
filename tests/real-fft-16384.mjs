import assert from 'node:assert/strict';
import {forwardReal16384, inverseReal16384, reorderReal16384} from '../dsp/real-fft-16384.mjs';
const input = new Float32Array(16384);
input[0] = 1;
const spectrum = forwardReal16384(input);
assert.equal(spectrum[0], 1);
assert.equal(spectrum[1], 1); // packed Nyquist
for (let i = 2; i < spectrum.length; i += 2) {
  assert.equal(spectrum[i], 1);
  assert.ok(spectrum[i + 1] === 0);
}
const reconstructed = inverseReal16384(spectrum);
assert.equal(reconstructed[0], 16384);
assert.ok(reconstructed.subarray(1).every((v) => v === 0));
assert.equal(input[0], 1);
assert.ok(input.subarray(1).every((v) => v === 0));
const labels = new Float32Array(16384), words = new Uint32Array(labels.buffer);
for (let i = 0; i < words.length; i++) words[i] = (i * 2654435761) >>> 0;
const ordered = reorderReal16384(labels);
assert.deepEqual(new Uint32Array(reorderReal16384(ordered, false).buffer), words);
assert.throws(() => forwardReal16384(new Float32Array(128)), /FFT16384/);
const invalid = new Float32Array(16384); invalid[1] = NaN;
assert.throws(() => inverseReal16384(invalid), /Finite/);
console.log('PASS FFT16384 impulse, unscaled inverse, bitwise reorder bijection and scope guards');
