// 692ffc prefix: share the first component's amplitude with other components.
import { fma32 } from './modal-kernel.mjs';
import { linearModelCurve } from './model-curves.mjs';
const f32 = Math.fround;

export function archiveExcitationMixCoefficients(bank, note, { runtimeMode } = {}) {
  const compound = bank.fields?.find(field => field.object_offset === 0x2548)?.value;
  if (compound?.version !== 14 || compound.curves?.length < 4)
    throw new RangeError('Verified version-14 source compound required');
  const evaluate = index => {
    const values = linearModelCurve(compound.curves[index], note, { runtimeMode });
    if (values.length !== 3) throw new RangeError('Three component coefficients required');
    return values.map(x => x < 0 ? 0 : x > 1 ? 1 : x);
  };
  return { coefficientA: evaluate(2), coefficientB: evaluate(3) };
}

export function mixExcitationComponents({ amplitude, columns, coefficientA, coefficientB,
  velocity, attenuation, blendFloor, inputBlend }) {
  if (!Number.isInteger(columns) || columns < 1 || columns > 3 || !amplitude.length || amplitude.length % columns ||
      coefficientA.length < 3 || coefficientB.length < 3 ||
      ![...amplitude, ...coefficientA, ...coefficientB, velocity, attenuation, blendFloor, inputBlend].every(Number.isFinite) ||
      velocity < 0 || attenuation < 0 || attenuation > 1)
    throw new RangeError('Complete component rows, coefficient triples and supported mix controls required');
  const result = Array.from(amplitude, f32), blend = Math.max(f32(inputBlend), f32(blendFloor));
  const coefficients = coefficientA.slice(0, 3).map((a, i) =>
    fma32(f32(a), f32(1 - blend), f32(f32(coefficientB[i]) * blend)));
  const control = f32(f32(velocity) * f32(1 - f32(attenuation)));
  const upper = control >= 0.5;
  const x = upper ? f32(f32(Math.min(control, 1) - 0.5) * 2) : f32(control + control);
  const weight = fma32(-x, x, f32(x + x));
  const low = coefficients[upper ? 1 : 0], high = coefficients[upper ? 2 : 1];
  if (columns > 1) for (let row = 0; row < amplitude.length / columns; row++) {
    const first = result[row * columns], a = f32(low * first), b = f32(high * first);
    for (let column = 1; column < columns; column++) {
      const i = row * columns + column, original = result[i];
      const from = fma32(f32(1 - low), original, a), to = fma32(f32(1 - high), original, b);
      result[i] = fma32(weight, f32(to - from), from);
    }
  }
  return { amplitude: result, coefficients, blend, control, weight, upper };
}
