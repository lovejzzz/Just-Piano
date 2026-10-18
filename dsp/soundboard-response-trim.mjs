// Common response tail selection and backwards sinusoidal taper, FUN_10014b0f4.
import {nativeDoubleSinCos} from './native-double-sincos.mjs';
import {fma32} from './modal-kernel.mjs';
const f = Math.fround;
const thresholdRatio = new Float32Array(new Uint32Array([0x3983b1f5]).buffer)[0];

export function trimSoundboardResponses(responses, tau) {
  if (!Array.isArray(responses) || !responses.length || !Number.isFinite(tau) ||
      !Number.isFinite(f(tau)) || !(f(tau) > 0)) {
    throw new RangeError('Response channels and positive float32 interval required');
  }
  const length = responses[0]?.length;
  if (!Number.isInteger(length) || length < 1 || responses.some((input) =>
    !(input instanceof Float32Array) || input.length !== length || input.some((v) => !Number.isFinite(v)))) {
    throw new RangeError('Aligned finite nonempty float32 responses required');
  }
  let peak = 0;
  for (const input of responses) for (const value of input) peak = Math.max(peak, Math.abs(value));
  const threshold = f(peak * thresholdRatio);
  let kept = length;
  search: for (let end = length; end > 1; end--) {
    for (const input of responses) {
      if (Math.abs(input[end - 1]) > threshold) {
        kept = end;
        break search;
      }
    }
  }
  const taperCount = Math.min(kept, Math.trunc(f(f(0.003) / f(tau))));
  const rotation = taperCount ? nativeDoubleSinCos((Math.PI / 2) / taperCount) : null;
  const sinStep = f(rotation?.sin ?? 0), cosStep = f(rotation?.cos ?? 1);
  const outputs = responses.map((input) => {
    const output = input.slice(0, kept);
    let sine = 0, cosine = 1;
    for (let index = 0; index < taperCount; index++) {
      const destination = kept - index - 1;
      output[destination] = f(sine * output[destination]);
      const sineProduct = f(sine * sinStep);
      const cosineProduct = f(cosine * sinStep);
      cosine = fma32(cosine, cosStep, -sineProduct);
      sine = fma32(sine, cosStep, cosineProduct);
    }
    return output;
  });
  return {outputs, length: kept, peak, threshold, taperCount};
}
