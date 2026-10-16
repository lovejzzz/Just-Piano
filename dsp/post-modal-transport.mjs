// 4e285c block carry and 20b28c group redistribution. These channels are
// internal modal groups, not the final microphone/stereo output.
// The redistribution coefficient is H+128; the tested GUI Stereo Width edit
// did not change it. Non-unity redistribution has not had a native runtime test.
import { fma32 } from './modal-kernel.mjs';
const f32 = Math.fround;

export function transportModalBlock(groups, delaySamples, previousTails) {
  const effectiveDelay = Math.floor(delaySamples / 4) * 4;
  if (!groups.length || !Number.isInteger(delaySamples) || delaySamples < 0 ||
      groups.some(g => g.length !== groups[0].length || !Array.from(g).every(Number.isFinite)) ||
      delaySamples > groups[0].length || previousTails.length !== groups.length ||
      previousTails.some(g => g.length !== effectiveDelay || !Array.from(g).every(Number.isFinite))) {
    throw new RangeError('Finite matching blocks, integer delay and matching initial tails required');
  }
  const length = groups[0].length;
  return {
    output: groups.map((group, i) => Float32Array.from([
      ...previousTails[i], ...group.slice(0, length - effectiveDelay)])),
    tails: groups.map(group => Float32Array.from(group.slice(length - effectiveDelay))),
    effectiveDelaySamples: effectiveDelay,
  };
}

export function redistributeModalGroups(groups, spread) {
  spread = f32(spread);
  if (!groups.length || !Number.isFinite(spread) ||
      groups.some(g => g.length !== groups[0].length || !Array.from(g).every(Number.isFinite))) {
    throw new RangeError('Finite matching group blocks and coefficient required');
  }
  const output = groups.map(g => Float32Array.from(g));
  if (spread >= 1) return output;
  const complement = f32(1 - spread);
  for (let group = 1; group < output.length; group++) {
    for (let i = 0; i < output[group].length; i++) {
      output[0][i] = fma32(complement, output[group][i], output[0][i]);
      output[group][i] = f32(spread * output[group][i]);
    }
  }
  return output;
}

export function bypassPostModalProcessor(groups, { smooth, enabled }) {
  if (smooth['0x5c'] !== 0 || smooth['0x60'] !== 0 || (enabled & 1)) {
    throw new RangeError('Active post-modal filter/blend processor remains unverified');
  }
  return groups.map(g => Float32Array.from(g));
}
