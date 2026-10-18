import {nativeScalarPowf} from './native-scalar-pow.mjs';
import {inverseReal16384} from './real-fft-16384.mjs';
const f = Math.fround;

export function computeSoundboardInverseSpectrum(prefix, {power, globalGain, channelGain}) {
  const n = prefix.length, bins = n / 2 + 1;
  if (n !== 16384 || !(prefix.packed instanceof Float32Array) || prefix.packed.length !== n + 2 ||
      !(prefix.magnitude instanceof Float32Array) || prefix.magnitude.length !== bins ||
      !(prefix.whitening?.output instanceof Float32Array) || prefix.whitening.output.length !== bins ||
      ![globalGain, channelGain].every((v) => v instanceof Float32Array && v.length === bins) ||
      !Number.isFinite(power) || !Number.isFinite(f(power)) ||
      [prefix.packed, prefix.magnitude, prefix.whitening.output, globalGain, channelGain].some((v) => v.some((x) => !Number.isFinite(x)))) {
    throw new RangeError('Finite FFT16384 spectral prefix and curve gains required');
  }
  const packed = prefix.packed.slice();
  const magnitude = new Float32Array(bins);
  let peak = 0;
  for (let i = 0; i < bins; i++) {
    const weight = prefix.whitening.output[i];
    packed[2 * i] = f(packed[2 * i] * weight);
    packed[2 * i + 1] = f(packed[2 * i + 1] * weight);
    magnitude[i] = f(weight * prefix.magnitude[i]);
    peak = Math.max(peak, Math.abs(magnitude[i]));
  }
  packed[0] = f(packed[0] * 0); packed[1] = f(packed[1] * 0);
  magnitude[0] = f(magnitude[0] * 0);
  const floor = f(peak * f(1e-6)), exponent = f(f(power) - 1);
  for (let i = 1; i < bins; i++) {
    const weight = nativeScalarPowf(f(floor + magnitude[i]), exponent);
    packed[2 * i] = f(packed[2 * i] * weight);
    packed[2 * i + 1] = f(packed[2 * i + 1] * weight);
    magnitude[i] = f(weight * magnitude[i]);
  }
  for (let i = 0; i < bins; i++) {
    const weight = f(globalGain[i] * channelGain[i]);
    packed[2 * i] = f(packed[2 * i] * weight);
    packed[2 * i + 1] = f(packed[2 * i + 1] * weight);
  }
  packed[1] = f(packed[n] + packed[n]);
  const inverseInput = Float32Array.from(packed.subarray(0, n), (v) => f(v * 0.5));
  const inverseOutput = inverseReal16384(inverseInput);
  if (inverseOutput.some((v) => !Number.isFinite(v))) throw new RangeError('Non-finite inverse output');
  return {inverseInput, inverseOutput, floor, peak};
}
