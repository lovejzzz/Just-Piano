// Raw observation responses -> propagation outputs before trim/filter stages.
// Preserve separate float32 subtraction, multiplication and division.
const f = Math.fround;

export function convertSoundboardResponses(responses, {mode, h, tau, speed, density, logicalLength}) {
  if (mode !== 0 && mode !== 1) throw new RangeError('Conversion mode must be 0 or 1');
  if (![h, tau, speed, density].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Positive finite propagation conversion controls required');
  }
  if (!Array.isArray(responses) || !responses.length) throw new RangeError('Response channels required');
  const [spacing, interval, waveSpeed, massDensity] = [h, tau, speed, density].map(f);
  if (![spacing, interval, waveSpeed, massDensity].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Conversion controls outside positive float32 range');
  }
  // s12 is reassigned to h*h at 0x1005a8bfc before either branch.
  const area = f(spacing * spacing);
  const scale = mode === 0 ? f(f(f(massDensity * -2) * area) / interval) :
    f(f(waveSpeed * f(massDensity + massDensity)) * area);
  if (!Number.isFinite(scale)) throw new RangeError('Conversion scale overflow');
  const outputs = responses.map((input) => {
    if (!(input instanceof Float32Array) || input.length < (mode === 0 ? 2 : 1) ||
        input.some((value) => !Number.isFinite(value))) {
      throw new RangeError('Finite nonempty float32 response required');
    }
    const length = logicalLength ?? input.length;
    if (!Number.isInteger(length) || length < (mode === 0 ? 2 : 1) || length > input.length) {
      throw new RangeError('Logical response length out of bounds');
    }
    const output = new Float32Array(length - (mode === 0 ? 1 : 0));
    for (let index = 0; index < output.length - 1; index++) {
      output[index] = mode === 0 ? f(f(input[index + 1] - input[index]) * scale) :
        f(input[index] * scale);
      if (!Number.isFinite(output[index])) throw new RangeError('Converted response overflow');
    }
    // Native store wzr overwrites the final sample in both branches.
    output[output.length - 1] = 0;
    return output;
  });
  return {outputs, scale, mode};
}
