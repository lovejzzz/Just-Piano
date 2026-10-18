import {fma32} from './modal-kernel.mjs';
import {nativeDoubleTan} from './native-double-tan.mjs';
const f = Math.fround;

export function soundboardSmoothingCoefficients(cutoff) {
  const frequency = Math.min(0.5, f(cutoff));
  if (!Number.isFinite(cutoff) || !(frequency > 0)) throw new RangeError('Positive finite smoothing frequency required');
  const tangent = nativeDoubleTan((frequency * Math.PI) * 0.5);
  const feed = f(tangent / (1 + tangent));
  return {b0: feed, b1: feed, a1: f((tangent - 1) / (1 + tangent))};
}

export function smoothSoundboardSpectrum(input, cutoff) {
  if (!(input instanceof Float32Array) || input.some((value) => !Number.isFinite(value))) {
    throw new RangeError('Finite float32 spectrum required');
  }
  const coefficients = soundboardSmoothingCoefficients(cutoff);
  const n = input.length;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    data[i] = input[n - i - 1]; data[n + i] = input[i]; data[2 * n + i] = input[n - i - 1];
  }
  const {b0, b1, a1} = coefficients;
  for (const reverse of [false, true]) {
    let previousInput = 0, previousOutput = 0;
    for (let step = 0; step < data.length; step++) {
      const i = reverse ? data.length - 1 - step : step;
      const current = data[i];
      const drive = fma32(current, b0, f(b1 * previousInput));
      previousOutput = fma32(-a1, previousOutput, drive);
      data[i] = previousOutput;
      previousInput = current;
    }
  }
  const output = data.slice(n, n * 2);
  if (output.some((value) => !Number.isFinite(value))) throw new RangeError('Non-finite smoothed spectrum');
  return {output, coefficients};
}
