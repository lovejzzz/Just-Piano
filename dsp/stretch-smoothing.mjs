// 10089701c: float biquad smoothing with impulse-peak delay compensation.
// Coefficient construction uses double sincos; filtering uses scalar float FMA.
import { fma32 } from './modal-kernel.mjs';
const f = Math.fround;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const roundAwayPositive = value => Math.floor(value + 0.5);

export function stretchSmoothingCoefficients(smoothing, math) {
  if (!Number.isFinite(smoothing)) throw new RangeError('Finite smoothing value required');
  if (typeof math?.sincos !== 'function') throw new TypeError('Explicit native double sincos dependency required');
  const clamped = clamp(f(smoothing), f(1e-5), f(0.999999));
  const angle = clamped * Math.PI;
  const { sin, cos } = math.sincos(angle);
  if (!Number.isFinite(sin) || !Number.isFinite(cos)) throw new RangeError('Finite native sincos result required');
  // 8970e0..f0 loads 0x3fe6a09e667f3bcc. This is one binary64 ULP
  // below JavaScript Math.SQRT1_2; retain the actual constant.
  const damped = sin * 0.7071067811865475;
  const inverse = 1 / (damped + 1);
  const difference = 1 - cos;
  const b0 = (difference * 0.5) * inverse;
  const b1 = difference * inverse;
  const a1 = (cos * -2) * inverse;
  const a2 = (1 - damped) * inverse;
  const numerator = [b0, b1, b0], denominator = [1, a1, a2];
  // 455ffc..45602c: convert each double once; feedback negation occurs
  // after conversion. Layout at 89701c's sp+48 is b2,-a2,b1,-a1,b0.
  const coefficients = [f(b0), -f(a2), f(b1), -f(a1), f(b0)];
  const probeSamples = roundAwayPositive(f(1 / clamped)); // FCVTAS, not truncation.
  return { smoothing: clamped, angle, numerator, denominator, coefficients, probeSamples };
}

function sample(input, state, coefficients) {
  const [b2, minusA2, b1, minusA1, b0] = coefficients;
  // 8973b0..3c8 / 89751c..534. The first product is separate FMUL;
  // input, x[n-2], y[n-1], y[n-2] are accumulated in this exact order.
  let value = f(b1 * state[0]);
  value = fma32(input, b0, value);
  value = fma32(b2, state[1], value);
  value = fma32(minusA1, state[2], value);
  value = fma32(minusA2, state[3], value);
  state[1] = state[0]; state[0] = input;
  state[3] = state[2]; state[2] = value;
  return value;
}

export function stretchSmooth(input, smoothing, extendLast, math) {
  if (!input?.length || !Array.from(input).every(Number.isFinite)) throw new RangeError('Nonempty finite input vector required');
  if (typeof extendLast !== 'boolean') throw new TypeError('Explicit tail-extension boolean required');
  const parameters = stretchSmoothingCoefficients(smoothing, math);
  // 8972f0..74d8 probes a separate zero-state filter. Specialized first
  // three samples have the same rounded terms for this positive b0/b1/b2
  // coefficient family; strict greater-than retains the earliest equal peak.
  const impulseState = new Float32Array(4);
  let peak = 0, delay = 0;
  for (let index = 0; index < parameters.probeSamples; index++) {
    const value = sample(index === 0 ? 1 : 0, impulseState, parameters.coefficients);
    const magnitude = Math.abs(value);
    if (magnitude > peak) { peak = magnitude; delay = index; }
  }
  const state = new Float32Array(4), values = new Float32Array(input.length);
  for (let index = 0; index < input.length + delay; index++) {
    const x = index < input.length ? f(input[index]) : extendLast ? f(input[input.length - 1]) : 0;
    const value = sample(x, state, parameters.coefficients);
    if (index >= delay) values[index - delay] = value;
  }
  return { ...parameters, values, delay, impulsePeak: peak, extendLast };
}
