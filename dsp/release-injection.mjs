/** Reconstructed release-dependent main-group source; filter supplied separately.
 * These operations are distinct from the modal string/damper solver.
 */
import { fma32 } from './modal-kernel.mjs';
const f = Math.fround;

export function generateReleaseInjection(input, target, state) {
  const count = input.length;
  if (count % 4 || !count) throw new Error('Four-sample release-source shape required');
  target = f(target);
  if (!state.amplitude) return { skipped: true, generated: new Float32Array(count) };
  let difference = f(target - state.position);
  let delta;
  if (Math.abs(difference) <= 1e-5) {
    state.position = target;
    delta = 0;
  } else delta = f(difference / count);
  delta = Math.max(-state.maxStep, Math.min(delta, state.maxStep));
  if (target === 1 && state.position === 1 && state.lastMagnitude <= 1e-4) {
    state.lastMagnitude = 0;
    return { skipped: true, generated: new Float32Array(count) };
  }
  const lanes = [state.position, f(state.position + delta),
    fma32(2, delta, state.position), fma32(3, delta, state.position)];
  const stride = f(delta * 4);
  const split = f(state.shape * .5);
  const bias = f(1 - state.shape);
  const lowGain = f(f(2 / state.shape) - 1);
  const generated = new Float32Array(count);
  for (let i = 0; i < count; i += 4) {
    for (let lane = 0; lane < 4; lane++) {
      const magnitude = Math.abs(f(input[i + lane]));
      const shaped = magnitude <= split ? f(magnitude * lowGain) : f(bias + magnitude);
      generated[i + lane] = f(f(1 - lanes[lane]) * shaped);
      lanes[lane] = f(lanes[lane] + stride);
    }
  }
  state.position = lanes[0] > .9999 ? 1 : lanes[0];
  return { skipped: false, generated };
}

export function modulateReleaseInjection(filtered, state) {
  const injection = new Float32Array(filtered.length);
  const gain = f(state.amplitude / 5);
  for (let i = 0; i < filtered.length; i++) {
    const scale = f(f(state.real + state.real) + 3);
    injection[i] = f(f(filtered[i] * gain) * scale);
    const real = fma32(state.cosine, state.real, -f(state.sine * state.imaginary));
    const imaginary = fma32(state.sine, state.real, f(state.cosine * state.imaginary));
    if (!Number.isFinite(real) || !Number.isFinite(imaginary)) {
      throw new Error('Unverified complex exceptional branch');
    }
    state.real = real;
    state.imaginary = imaginary;
  }
  return injection;
}

export function addReleaseInjection(primary, injection) {
  if (primary.length !== injection.length) throw new Error('Mismatched release injection shape');
  return Float32Array.from(primary, (sample, i) => f(sample + injection[i]));
}
