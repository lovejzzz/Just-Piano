import {fma32} from './modal-kernel.mjs';
import {fma64} from './modal-poles.mjs';
import {nativeDoubleSinCos} from './native-double-sincos.mjs';
const f = Math.fround;
const roundAway = (x) => x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);

export function soundboardResamplingRatio(ratio) {
  const value = f(ratio);
  if (!Number.isFinite(value) || !(value > 0)) throw new RangeError('Positive finite resampling ratio required');
  let numerator = roundAway(value), denominator = 1, remainder = value - numerator;
  let previousNumerator = 1, previousDenominator = 0;
  for (let i = 0; remainder !== 0 && Math.abs(numerator / denominator - value) >= 1e-5; i++) {
    if (i >= 64) throw new RangeError('Resampling fraction did not converge');
    const reciprocal = 1 / remainder, integral = roundAway(reciprocal);
    remainder = reciprocal - integral;
    const nextNumerator = fma64(numerator, integral, previousNumerator);
    const nextDenominator = fma64(denominator, integral, previousDenominator);
    previousNumerator = numerator; previousDenominator = denominator;
    numerator = nextNumerator; denominator = nextDenominator;
  }
  if (numerator < 0) {numerator = -numerator; denominator = -denominator;}
  if (![numerator, denominator].every((v) => Number.isInteger(v) && v > 0 && v <= 4096)) {
    throw new RangeError('Resampling fraction outside supported plan bounds');
  }
  return {numerator, denominator};
}

// Real-axis specialization of the native complex I0 power series.
function besselI0(value) {
  const square = value * (value * 0.25);
  let raw = 1, factorial = 1, sum = 1;
  for (let k = 1; k <= 29; k++) {
    raw *= square; factorial *= k;
    const term = (raw / factorial) / factorial;
    sum += term;
    if (term * term < 1e-20) break;
  }
  return sum;
}

export function createSoundboardResamplingPlan(ratio, quality = 10) {
  if (!Number.isInteger(quality) || quality < 1 || quality > 32) throw new RangeError('Supported resampling quality required');
  const {numerator, denominator} = soundboardResamplingRatio(ratio);
  if (numerator === 1 && denominator === 1) return {numerator, denominator, filterLength: 1, taps: 1, coefficients: Float32Array.of(1)};
  const maxFactor = Math.max(numerator, denominator);
  const filterLength = quality * maxFactor * 2 + 1;
  if (filterLength > 65537) throw new RangeError('Resampling filter outside supported bounds');
  const center = (filterLength - 1) / 2, cutoff = f(f(0.5 / maxFactor) * 2);
  const taps = Math.ceil(filterLength / numerator), coefficients = new Float32Array(numerator * taps);
  const window = new Float64Array(filterLength), normalizer = besselI0(10);
  for (let distance = 0; distance <= center; distance++) {
    const position = ((distance * distance * -4) / ((filterLength - 1) * (filterLength - 1))) + 1;
    const value = besselI0(10 * Math.sqrt(Math.max(0, position))) / normalizer;
    window[center - distance] = value;
    window[center + distance] = value;
  }
  const impulse = new Float64Array(numerator * taps);
  for (let i = 0; i < filterLength; i++) {
    const distance = Math.abs(i - center);
    const argument = ((cutoff * 0.5) * (distance + distance)) * Math.PI;
    const sinc = argument === 0 ? 1 : nativeDoubleSinCos(argument).sin / argument;
    const ideal = cutoff * sinc;
    impulse[i] = ideal * (window[i] * numerator);
  }
  for (let phase = 0; phase < numerator; phase++) {
    for (let tap = 0; tap < taps; tap++) coefficients[phase * taps + tap] = f(impulse[phase + tap * numerator]);
  }
  return {numerator, denominator, filterLength, taps, coefficients};
}

export function resampleSoundboardResponse(input, plan) {
  const {numerator, denominator, filterLength, taps, coefficients} = plan;
  if (!(input instanceof Float32Array) || input.some((v) => !Number.isFinite(v)) ||
      ![numerator, denominator, filterLength, taps].every((v) => Number.isInteger(v) && v > 0) ||
      !(coefficients instanceof Float32Array) || coefficients.length !== numerator * taps ||
      coefficients.some((v) => !Number.isFinite(v))) throw new RangeError('Finite mono response and complete resampling plan required');
  if (!input.length || (numerator === 1 && denominator === 1)) return {output: input.slice(), frames: input.length};
  const frames = Math.max(1, Math.trunc((input.length * numerator) / denominator));
  const output = new Float32Array(Math.ceil(frames / 64) * 64);
  let position = Math.trunc(filterLength / 2);
  for (let frame = 0; frame < frames; frame++, position += denominator) {
    const source = Math.trunc(position / numerator), phase = position - source * numerator;
    const count = Math.min(taps, source + 1), vectorEnd = Math.trunc(count / 4) * 4;
    let value = 0;
    for (let tap = 0; tap < count; tap++) {
      const sample = source - tap < input.length ? input[source - tap] : 0;
      const coefficient = coefficients[phase * taps + tap];
      value = tap < vectorEnd ? f(value + f(sample * coefficient)) : fma32(coefficient, sample, value);
    }
    output[frame] = value;
  }
  if (output.some((v) => !Number.isFinite(v))) throw new RangeError('Non-finite resampled response');
  return {output, frames};
}
