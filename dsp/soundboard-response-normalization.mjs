// FUN_1006bc7ec: ordered absolute sum, rate normalization, scale and impulse mix.
const f = Math.fround;

export function normalizeSoundboardResponses(responses, {gain, sampleRate, impulseMix}) {
  if (![gain, sampleRate, impulseMix].every((v) => Number.isFinite(v) && Number.isFinite(f(v))) ||
      !(f(sampleRate) > 0) || !Array.isArray(responses) || !responses.length) {
    throw new RangeError('Finite normalization controls and response channels required');
  }
  const g = f(gain), rate = f(sampleRate), mix = f(impulseMix);
  const normalizations = [], scales = [];
  const outputs = responses.map((input) => {
    if (!(input instanceof Float32Array) || input.some((v) => !Number.isFinite(v)) ||
        (mix !== 0 && input.length === 0)) throw new RangeError('Finite response required');
    let sum = 0;
    for (const value of input) sum = f(sum + Math.abs(value));
    const normalization = Math.max(f(0.00001), f(sum / rate));
    const scale = f(g / normalization);
    normalizations.push(normalization); scales.push(scale);
    const output = Float32Array.from(input, (v) => f(v * scale));
    if (mix !== 0) {
      const remaining = f(1 - mix);
      for (let i = 0; i < output.length; i++) output[i] = f(output[i] * remaining);
      output[0] = f(output[0] + f(f(f(rate * g) * mix) / 10));
    }
    if (output.some((v) => !Number.isFinite(v))) throw new RangeError('Non-finite normalized response');
    return output;
  });
  return {outputs, normalizations, scales};
}
