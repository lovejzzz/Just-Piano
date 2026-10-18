import {nativeDoublePow} from './native-double-pow.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
const f = Math.fround;
const floor = new Float32Array(new Uint32Array([0x2edbe6ff]).buffer)[0];
const log10 = new Float32Array(new Uint32Array([0x40135d8e]).buffer)[0];

export function reconstructSoundboardTime(input, prefix, inverse) {
  const {start, end, length: n} = prefix;
  if (!(input instanceof Float32Array) || input.some((v) => !Number.isFinite(v)) ||
      n !== 16384 || !Number.isInteger(start) || !Number.isInteger(end) ||
      start < 0 || end <= start || end > input.length || end - start > n ||
      !(inverse.inverseInput instanceof Float32Array) || inverse.inverseInput.length !== n ||
      !(inverse.inverseOutput instanceof Float32Array) || inverse.inverseOutput.length !== n ||
      [inverse.inverseInput, inverse.inverseOutput].some((v) => v.some((x) => !Number.isFinite(x)))) {
    throw new RangeError('Finite FFT16384 inverse and response span required');
  }
  const span = end - start;
  const original = new Float32Array(n + 2);
  original.set(input.subarray(start, end));
  const scaledInverse = new Float32Array(n + 2), scale = f(1 / f(n));
  for (let i = 0; i < n; i++) scaledInverse[i] = f(inverse.inverseOutput[i] * scale);
  // The two extended packed words are outside the inverse transform's N samples.
  scaledInverse[n] = f(f(inverse.inverseInput[1] * 0.5) * scale);
  const weights = new Float32Array(span).fill(1);
  const core = scaledInverse.slice(0, span);
  let headTailSums = null, decayRatio = null;
  const window = Math.trunc((span + 5) / 10);
  if (span + 5 >= 20) {
    const sums = [0, 0, 0, 0];
    for (let i = 0; i < Math.max(window, 1); i++) {
      sums[0] = f(sums[0] + Math.abs(original[i]));
      sums[1] = f(sums[1] + Math.abs(original[span - i]));
      sums[2] = f(sums[2] + Math.abs(scaledInverse[i]));
      sums[3] = f(sums[3] + Math.abs(scaledInverse[span - i]));
    }
    headTailSums = sums;
    decayRatio = f(f(sums[1] / sums[0]) / f(sums[3] / sums[2]));
    if (!(decayRatio > 0) || !Number.isFinite(decayRatio)) throw new RangeError('Positive finite decay ratio required');
    const step = f(1 / f(span - 1));
    for (let i = 0; i < span; i++) {
      const position = f(f(i) * step);
      weights[i] = f(nativeDoublePow(decayRatio, nativeDoublePow(position, 4)));
      core[i] = f(scaledInverse[i] * weights[i]);
    }
    const denominator = f(f(window) * 20);
    for (let i = 0; i <= window; i++) {
      const exponent = f(f(f(f(i) * -20) / denominator) * log10);
      const index = span - 1 - window + i;
      core[index] = f(nativeScalarExp(exponent) * core[index]);
    }
  }
  let originalSum = 0, shapedSum = 0;
  for (const value of input) originalSum = f(originalSum + Math.abs(value));
  for (const value of core) shapedSum = f(shapedSum + Math.abs(value));
  const gain = f(originalSum / Math.max(floor, shapedSum));
  for (let i = 0; i < core.length; i++) core[i] = f(core[i] * gain);
  const output = input.slice(); output.set(core, start);
  if (output.some((v) => !Number.isFinite(v))) throw new RangeError('Non-finite reconstructed response');
  return {original, scaledInverse, weights, core, output, headTailSums, decayRatio,
    originalSum, shapedSum, gain, window};
}
