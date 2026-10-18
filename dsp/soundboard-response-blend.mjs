// Empty-kernel branch of FUN_1006c5ce8. The convolving branch stays explicit.
import {fma32} from './modal-kernel.mjs';
const f = Math.fround;

export function blendSoundboardResponses(responses, {mainCount, coefficients, kernelLength}) {
  if (kernelLength !== 0) throw new RangeError('Convolving soundboard blend is not implemented');
  if (!Number.isInteger(mainCount) || mainCount < 1 || !Array.isArray(responses) ||
      responses.length !== mainCount * 2) throw new RangeError('Paired main/auxiliary channel layout required');
  if ((!Array.isArray(coefficients) && !(coefficients instanceof Float32Array)) ||
      coefficients.length < mainCount) throw new RangeError('Blend coefficient vector too short');
  const outputs = Array.from({length: mainCount}, (_, channel) => {
    const main = responses[channel], auxiliary = responses[channel + mainCount];
    if (!(main instanceof Float32Array) || !(auxiliary instanceof Float32Array) ||
        main.length !== auxiliary.length || [main, auxiliary].some((a) => a.some((v) => !Number.isFinite(v)))) {
      throw new RangeError('Aligned finite float32 channel pair required');
    }
    const amount = f(coefficients[channel]);
    if (!Number.isFinite(amount)) throw new RangeError('Finite float32 blend amount required');
    const output = Float32Array.from(main, (value) => f(value * f(1 - amount)));
    // Native vector addition returns immediately for an exactly zero scale.
    if (amount !== 0) {
      for (let i = 0; i < output.length; i++) {
        output[i] = amount === 1 ? f(output[i] + auxiliary[i]) : fma32(amount, auxiliary[i], output[i]);
      }
    }
    if (output.some((v) => !Number.isFinite(v))) throw new RangeError('Non-finite blended response');
    return output;
  });
  return {outputs, mainCount, convolvingBranch: false};
}
