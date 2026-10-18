import assert from 'node:assert/strict';
import {forwardReal32768, inverseReal32768, reorderReal32768} from '../dsp/real-fft-32768.mjs';
const input = new Float32Array(32768);
input[0] = 1;
const spectrum = forwardReal32768(input);
assert.equal(spectrum[0], 1);
assert.equal(spectrum[1], 1); // packed Nyquist
for (let i = 2; i < spectrum.length; i += 2) {
  assert.equal(spectrum[i], 1);
  assert.ok(spectrum[i + 1] === 0);
}
const reconstructed = inverseReal32768(spectrum);
assert.equal(reconstructed[0], 32768);
assert.ok(reconstructed.subarray(1).every((v) => v === 0));
assert.equal(input[0], 1);
assert.ok(input.subarray(1).every((v) => v === 0));
const labels = new Float32Array(32768), words = new Uint32Array(labels.buffer);
for (let i = 0; i < words.length; i++) words[i] = (i * 2654435761) >>> 0;
const ordered = reorderReal32768(labels);
assert.deepEqual(new Uint32Array(reorderReal32768(ordered, false).buffer), words);
assert.throws(() => forwardReal32768(new Float32Array(128)), /FFT32768/);
const invalid = new Float32Array(32768); invalid[1] = NaN;
assert.throws(() => inverseReal32768(invalid), /Finite/);
console.log('PASS FFT32768 impulse, unscaled inverse, bitwise reorder bijection and scope guards');
