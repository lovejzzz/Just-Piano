import {forwardRealCore2048} from './real-fft-core.mjs';
import {finalizeReal8192} from './real-fft-finalize.mjs';
import {preprocessInverseReal8192, inverseRealCore2048} from './real-fft-inverse.mjs';
import {buildReal8192Coefficients} from './real-fft-8192-coefficients.mjs';
const coefficients = buildReal8192Coefficients();
function check(input) {
  if (!(input instanceof Float32Array) || input.length !== 8192 || input.some(v => !Number.isFinite(v)))
    throw new RangeError('Finite float32 FFT8192 input required');
}
export function reorderReal8192(input, toOrdered = true) {
  if (!(input instanceof Float32Array) || input.length !== 8192 || typeof toOrdered !== 'boolean')
    throw new RangeError('FFT8192 reorder input and direction required');
  const output = new Float32Array(8192), source = new Uint32Array(input.buffer, input.byteOffset, input.length);
  const destination = new Uint32Array(output.buffer);
  for (let band = 0; band < 4; band++) for (let i = 0; i < 1024; i++) {
    const index = band % 2 ? (1024 - i) % 1024 : i;
    const unordered = Math.floor(index / 4) * 32 + band * 8 + index % 4, ordered = band * 2048 + i * 2;
    if (toOrdered) {
      destination[ordered] = source[unordered]; destination[ordered + 1] = source[unordered + 4];
    } else {
      destination[unordered] = source[ordered]; destination[unordered + 4] = source[ordered + 1];
    }
  }
  return output;
}
export function forwardReal8192(input) {
  check(input);
  return reorderReal8192(finalizeReal8192(forwardRealCore2048(input, coefficients.twiddle), coefficients.e));
}
export function inverseReal8192(input) {
  check(input);
  return inverseRealCore2048(preprocessInverseReal8192(reorderReal8192(input, false), coefficients.e), coefficients.twiddle);
}
