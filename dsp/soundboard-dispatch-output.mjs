const f = Math.fround;

export function finalizeSoundboardDispatch(responses, outputRate) {
  if (!Array.isArray(responses) || !responses.length || !Number.isFinite(outputRate) ||
      !Number.isFinite(f(outputRate)) || !(f(outputRate) > 0)) {
    throw new RangeError('Finite dispatcher responses and positive output rate required');
  }
  const scale = f(f(44100) / f(outputRate));
  const outputs = responses.map((input) => {
    if (!(input instanceof Float32Array) || input.some((v) => !Number.isFinite(v))) {
      throw new RangeError('Finite float32 dispatcher response required');
    }
    const output = Float32Array.from(input, (v) => f(v * scale));
    if (output.some((v) => !Number.isFinite(v))) throw new RangeError('Non-finite dispatcher output');
    return output;
  });
  return {outputs, scale};
}
