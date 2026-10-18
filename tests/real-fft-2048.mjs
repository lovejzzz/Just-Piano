import assert from 'node:assert/strict';
import {forwardReal2048, inverseReal2048, reorderReal2048} from '../dsp/real-fft-2048.mjs';
const n = 2048, impulse = new Float32Array(n); impulse[0] = 1;
const spectrum = forwardReal2048(impulse);
assert.equal(spectrum[0], 1); assert.equal(spectrum[1], 1);
for (let i = 2; i < n; i += 2) {
  assert.equal(spectrum[i], 1); assert.ok(spectrum[i + 1] === 0);
}
const recovered = inverseReal2048(spectrum);
assert.equal(recovered[0], n); assert.ok(recovered.subarray(1).every(v => v === 0));
// Analytic DC, Nyquist, cosine and sine bins independently test frequency
// placement and sign; inverse agreement alone could conceal a shared reorder bug.
const input = Float32Array.from({length: n}, (_, i) =>
  0.125 + (i % 2 ? -0.0625 : 0.0625) + 0.5 * Math.cos(2 * Math.PI * 37 * i / n) +
  0.25 * Math.sin(2 * Math.PI * 513 * i / n));
const own = forwardReal2048(input);
for (let i = 0; i < n; i++) {
  const expected = i === 0 ? n * 0.125 : i === 1 ? n * 0.0625 :
    i === 74 ? n * 0.25 : i === 1027 ? -n * 0.125 : 0;
  assert.ok(Math.abs(own[i] - expected) < 0.001, `analytic packed bin ${i}`);
}
const inverse = inverseReal2048(own);
for (let i = 0; i < n; i++) assert.ok(Math.abs(inverse[i] / n - input[i]) < 5e-7);
const labels = new Float32Array(n), words = new Uint32Array(labels.buffer);
for (let i = 0; i < n; i++) words[i] = (i * 2654435761) >>> 0;
assert.deepEqual(new Uint32Array(reorderReal2048(reorderReal2048(labels), false).buffer), words);
assert.throws(() => forwardReal2048(new Float32Array(1024)), /FFT2048/);
const bad = new Float32Array(n); bad[1] = NaN;
assert.throws(() => inverseReal2048(bad), /Finite/);
console.log('FFT2048 impulse, analytic bins/sign, unscaled inverse, bitwise reorder and guards passed');
