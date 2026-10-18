// Paired-channel correction and flagged-channel first-order wrapper filter.
import {fma32} from './modal-kernel.mjs';
import {nativeDoubleTan} from './native-double-tan.mjs';
const f = Math.fround;

export function filterSoundboardResponses(responses, processing) {
  const {sampleRate, cutoff, adjustmentNumerator, adjustmentDenominator, channels} = processing;
  if (![sampleRate, cutoff, adjustmentNumerator, adjustmentDenominator].every(Number.isFinite) ||
      !(f(sampleRate) > 0) || !Number.isFinite(f(sampleRate)) || cutoff < 0) {
    throw new RangeError('Finite soundboard filter controls required');
  }
  if (!Array.isArray(responses) || !responses.length || !Array.isArray(channels) ||
      channels.length !== responses.length) throw new RangeError('Aligned response metadata required');
  const outputs = responses.map((input) => {
    if (!(input instanceof Float32Array) || input.some((v) => !Number.isFinite(v))) {
      throw new RangeError('Finite float32 responses required');
    }
    return input.slice();
  });
  for (const channel of channels) {
    if (!Number.isInteger(channel.flag) || channel.flag < 0 || channel.flag > 0xffffffff ||
        !Number.isInteger(channel.kind) || channel.kind < 0 || channel.kind > 0xffffffff ||
        !(Number.isSafeInteger(channel.identity) ||
          (typeof channel.identity === 'string' && channel.identity.length > 0))) {
      throw new RangeError('Valid native channel metadata required');
    }
  }
  const rate = f(sampleRate);
  if (![cutoff, adjustmentNumerator, adjustmentDenominator].every((v) => Number.isFinite(f(v)))) {
    throw new RangeError('Filter controls outside finite float32 range');
  }
  const selectedCutoff = Math.min(f(cutoff), f(f(rate * f(0.95)) * 0.5));
  const tangent = f(nativeDoubleTan((selectedCutoff * Math.PI) / rate));
  const feedback = f(f(tangent - 1) / f(tangent + 1));
  const feed = f(f(1 - feedback) / f(rate + rate));
  const adjustmentScale = f(adjustmentDenominator) > 0 ?
    f(f(adjustmentNumerator) / f(adjustmentDenominator)) : null;
  const referenceIndices = [];
  for (let channel = 0; channel < channels.length; channel++) {
    if (!channels[channel].flag) { referenceIndices.push(null); continue; }
    const output = outputs[channel];
    let referenceIndex = null;
    if (adjustmentScale !== null) {
      referenceIndex = channels.findIndex((candidate) => !candidate.flag &&
        candidate.identity === channels[channel].identity && candidate.kind === channels[channel].kind);
      if (referenceIndex < 0 || outputs[referenceIndex].length !== output.length) {
        throw new RangeError('Matching unflagged reference channel required');
      }
      for (let i = 0; i < output.length; i++) {
        output[i] = f(fma32(-1, outputs[referenceIndex][i], output[i]) * adjustmentScale);
      }
    }
    referenceIndices.push(referenceIndex);
    let previousOutput = 0, previousInput = 0;
    for (let i = 0; i < output.length; i++) {
      const input = output[i];
      const drive = fma32(previousInput, 0, f(feed * input));
      previousOutput = fma32(-feedback, previousOutput, drive);
      output[i] = previousOutput;
      previousInput = input;
    }
    if (output.some((v) => !Number.isFinite(v))) throw new RangeError('Non-finite filtered output');
  }
  return {outputs, selectedCutoff, tangent, feedback, feed, adjustmentScale, referenceIndices};
}
