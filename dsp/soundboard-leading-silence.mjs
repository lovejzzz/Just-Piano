// FUN_10019dfc4: exact-zero prefix handling selected by the native config flag.
export function processSoundboardLeadingSilence(responses, mode) {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0xffffffff) {
    throw new RangeError('Unsigned leading-silence mode required');
  }
  if (!Array.isArray(responses) || !responses.length || responses.some((input) =>
    !(input instanceof Float32Array) || input.some((value) => !Number.isFinite(value)))) {
    throw new RangeError('Finite float32 response channels required');
  }
  const prefixLengths = responses.map((input) => {
    let count = 0;
    while (count < input.length && input[count] === 0) count++;
    return count;
  });
  const commonPrefix = Math.min(10000000, ...prefixLengths);
  const shifts = mode === 0 ? prefixLengths.map(() => commonPrefix) : prefixLengths;
  const outputs = responses.map((input, channel) => {
    if (mode === 0) return input.slice(commonPrefix);
    const output = new Float32Array(input.length);
    output.set(input.subarray(shifts[channel]));
    return output;
  });
  return {outputs, mode, prefixLengths, commonPrefix, shifts};
}
