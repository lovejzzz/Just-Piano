import {forwardRealCore512} from './real-fft-core.mjs';
import {finalizeReal2048} from './real-fft-finalize.mjs';
import {preprocessInverseReal2048, inverseRealCore512} from './real-fft-inverse.mjs';
import {buildReal2048Coefficients} from './real-fft-2048-coefficients.mjs';
const coefficients = buildReal2048Coefficients();
function check(input) {
  if (!(input instanceof Float32Array) || input.length !== 2048 || input.some(v => !Number.isFinite(v)))
    throw new RangeError('Finite float32 FFT2048 input required');
}
export function reorderReal2048(input, toOrdered = true) {
  if (!(input instanceof Float32Array) || input.length !== 2048 || typeof toOrdered !== 'boolean')
    throw new RangeError('FFT2048 reorder input and direction required');
  const output = new Float32Array(2048), source = new Uint32Array(input.buffer, input.byteOffset, input.length);
  const destination = new Uint32Array(output.buffer);
  for (let band = 0; band < 4; band++) for (let i = 0; i < 256; i++) {
    const index = band % 2 ? (256 - i) % 256 : i;
    const unordered = Math.floor(index / 4) * 32 + band * 8 + index % 4, ordered = band * 512 + i * 2;
    if (toOrdered) {
      destination[ordered] = source[unordered]; destination[ordered + 1] = source[unordered + 4];
    } else {
      destination[unordered] = source[ordered]; destination[unordered + 4] = source[ordered + 1];
    }
  }
  return output;
}
export function forwardReal2048(input) {
  check(input);
  return reorderReal2048(finalizeReal2048(forwardRealCore512(input, coefficients.twiddle), coefficients.e));
}
export function inverseReal2048(input) {
  check(input);
  return inverseRealCore512(preprocessInverseReal2048(reorderReal2048(input, false), coefficients.e), coefficients.twiddle);
}
