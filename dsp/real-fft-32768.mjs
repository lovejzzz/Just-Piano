import {forwardRealCore8192} from './real-fft-core.mjs';
import {finalizeReal32768} from './real-fft-finalize.mjs';
import {preprocessInverseReal32768, inverseRealCore8192} from './real-fft-inverse.mjs';
import {buildReal32768Coefficients} from './real-fft-32768-coefficients.mjs';
const coefficients = buildReal32768Coefficients();

function check(input) {
  if (!(input instanceof Float32Array) || input.length !== 32768 || input.some((v) => !Number.isFinite(v))) {
    throw new RangeError('Finite float32 FFT32768 input required');
  }
}

// FUN_1002a6a58, real/nonalias branch: transpose four-lane vectors, reversing odd
// frequency bands cyclically. No sample values participate in this mapping.
export function reorderReal32768(input, toOrdered = true) {
  if (!(input instanceof Float32Array) || input.length !== 32768 || typeof toOrdered !== 'boolean') {
    throw new RangeError('FFT32768 reorder input and direction required');
  }
  const output = new Float32Array(32768);
  const source = new Uint32Array(input.buffer, input.byteOffset, input.length);
  const destination = new Uint32Array(output.buffer);
  for (let band = 0; band < 4; band++) {
    for (let i = 0; i < 4096; i++) {
      const index = band % 2 ? (4096 - i) % 4096 : i;
      const unordered = Math.floor(index / 4) * 32 + band * 8 + index % 4;
      const ordered = band * 8192 + i * 2;
      if (toOrdered) {
        destination[ordered] = source[unordered]; destination[ordered + 1] = source[unordered + 4];
      } else {
        destination[unordered] = source[ordered]; destination[unordered + 4] = source[ordered + 1];
      }
    }
  }
  return output;
}

export function forwardReal32768(input) {
  check(input);
  return reorderReal32768(finalizeReal32768(forwardRealCore8192(input, coefficients.twiddle), coefficients.e));
}

// Native inverse is unscaled, including the packed DC/Nyquist pair.
export function inverseReal32768(input) {
  check(input);
  return inverseRealCore8192(preprocessInverseReal32768(reorderReal32768(input, false), coefficients.e), coefficients.twiddle);
}
