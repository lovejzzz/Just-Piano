import {forwardRealCore4096} from './real-fft-core.mjs';
import {finalizeReal16384} from './real-fft-finalize.mjs';
import {preprocessInverseReal16384, inverseRealCore4096} from './real-fft-inverse.mjs';
import {buildReal16384Coefficients} from './real-fft-16384-coefficients.mjs';
const coefficients = buildReal16384Coefficients();

function check(input) {
  if (!(input instanceof Float32Array) || input.length !== 16384 || input.some((v) => !Number.isFinite(v))) {
    throw new RangeError('Finite float32 FFT16384 input required');
  }
}

// FUN_1002a6a58, real/nonalias branch: transpose four-lane vectors, reversing odd
// frequency bands cyclically. No sample values participate in this mapping.
export function reorderReal16384(input, toOrdered = true) {
  if (!(input instanceof Float32Array) || input.length !== 16384 || typeof toOrdered !== 'boolean') {
    throw new RangeError('FFT16384 reorder input and direction required');
  }
  const output = new Float32Array(16384);
  const source = new Uint32Array(input.buffer, input.byteOffset, input.length);
  const destination = new Uint32Array(output.buffer);
  for (let band = 0; band < 4; band++) {
    for (let i = 0; i < 2048; i++) {
      const index = band % 2 ? (2048 - i) % 2048 : i;
      const unordered = Math.floor(index / 4) * 32 + band * 8 + index % 4;
      const ordered = band * 4096 + i * 2;
      if (toOrdered) {
        destination[ordered] = source[unordered]; destination[ordered + 1] = source[unordered + 4];
      } else {
        destination[unordered] = source[ordered]; destination[unordered + 4] = source[ordered + 1];
      }
    }
  }
  return output;
}

export function forwardReal16384(input) {
  check(input);
  return reorderReal16384(finalizeReal16384(forwardRealCore4096(input, coefficients.twiddle), coefficients.e));
}

// Native inverse is unscaled, including the packed DC/Nyquist pair.
export function inverseReal16384(input) {
  check(input);
  return inverseRealCore4096(preprocessInverseReal16384(reorderReal16384(input, false), coefficients.e), coefficients.twiddle);
}
