/** Native 3e229c: one feed-forward delay per internal modal group.
 * State is caller-owned. Float32 multiplication and addition are separate.
 * Smoother reseeding via 34a33c is deliberately unsupported until observed.
 */
const f32 = Math.fround;

export function advanceDelayGain(state) {
  if (!state.remaining) return;
  const current = state.dryGain || (state.target > 0 ? f32(1e-6) : f32(-1e-6));
  state.dryGain = f32(state.multiplier * current);
  state.remaining -= 1;
  if (!state.remaining) {
    const tolerance = f32(0.9999);
    if (f32(state.dryGain * tolerance) <= state.target &&
        f32(state.target * tolerance) <= state.dryGain) {
      state.dryGain = state.target;
    } else {
      throw new Error('Unverified native delay-gain reseed branch');
    }
  }
}

export function renderVoiceDelay(input, state) {
  if (!Number.isInteger(state.length) || state.length < 0 ||
      state.ring.length !== state.length || !Number.isInteger(state.elapsed) ||
      !Number.isInteger(state.remaining) || state.remaining < 0) {
    throw new Error('Invalid voice-delay state');
  }
  if (!state.length) return Float32Array.from(input);
  const output = new Float32Array(input.length);
  let index = state.elapsed % state.length;
  for (let i = 0; i < input.length; ++i) {
    const sample = f32(input[i]);
    let value = f32(sample * state.dryGain);
    if (state.elapsed >= state.length) {
      // Native slow path updates the gain AFTER multiplying this sample.
      advanceDelayGain(state);
      value = f32(value + state.ring[index]);
    }
    output[i] = value;
    state.ring[index] = f32(sample * state.writeGain);
    state.elapsed = (state.elapsed + 1) >>> 0;
    index = index + 1 < state.length ? index + 1 : 0;
  }
  return output;
}

export function scaleVoiceGroups(groups, level, gain) {
  const factor = f32(f32(level) * f32(gain));
  return groups.map(group => Float32Array.from(group, sample => f32(sample * factor)));
}
