import {fma32} from './modal-kernel.mjs';
import {forwardReal16384} from './real-fft-16384.mjs';
import {forwardReal32768} from './real-fft-32768.mjs';
import {whitenSoundboardSpectrum} from './soundboard-spectrum-whitening.mjs';
const f = Math.fround;

export function prepareSoundboardSpectralPrefix(input, {tau, amount, width, flags}) {
  if (!(input instanceof Float32Array) || input.some((v) => !Number.isFinite(v)) ||
      !Number.isFinite(tau) || !(f(tau) > 0)) throw new RangeError('Finite response and positive interval required');
  let start = 0, end = input.length;
  while (start < end && input[start] === 0) start++;
  while (end > start && input[end - 1] === 0) end--;
  if (end === start) throw new RangeError('Nonzero response required');
  let length = 1;
  while (length < (end - start) * 2) length *= 2;
  if (![16384, 32768].includes(length)) throw new RangeError('Spectral prefix requires FFT16384 or FFT32768');
  const time = new Float32Array(length);
  time.set(input.subarray(start, end));
  const packed = new Float32Array(length + 2);
  const forward = length === 16384 ? forwardReal16384 : forwardReal32768;
  packed.set(Float32Array.from(forward(time), (v) => f(v * 2)));
  packed[length] = f(packed[1] * 0.5);
  packed[1] = 0; packed[length + 1] = 0;
  const magnitude = new Float32Array(length / 2 + 1);
  const vectorEnd = Math.floor(magnitude.length / 4) * 4;
  for (let i = 0; i < magnitude.length; i++) {
    const real = packed[i * 2], imag = packed[i * 2 + 1];
    const square = i < vectorEnd ? fma32(real, real, f(imag * imag)) :
      f(f(real * real) + f(imag * imag));
    magnitude[i] = f(Math.sqrt(square));
  }
  const binSpacing = f(1 / f(f(tau) * f(length - 1)));
  const whitening = whitenSoundboardSpectrum(magnitude, {amount, width, flags, binSpacing});
  return {start, end, length, packed, magnitude, binSpacing, whitening};
}
