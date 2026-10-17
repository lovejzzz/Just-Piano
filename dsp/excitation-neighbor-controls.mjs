// 1c5a98..1c5b3c: two complex base curves become log-magnitude/angle.
// Float hypot/atan2 implementations are explicit unresolved math dependencies.
import {linearModelCurve} from './model-curves.mjs';
import {nativeScalarLogf} from './native-scalar-log.mjs';
import {fma32} from './modal-kernel.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
const f = Math.fround;

export function archiveNeighborControls(bank, note, {runtimeMode, hypotf, atan2f} = {}) {
  if (typeof hypotf !== 'function' || typeof atan2f !== 'function')
    throw new TypeError('Explicit native float hypotf and atan2f dependencies required');
  const pairs = [0x1928, 0x1978].map(offset => {
    const curve = bank.fields?.find(row => row.object_offset === offset)?.value;
    const pair = linearModelCurve(curve, note, {runtimeMode});
    if (pair.length !== 2) throw new RangeError('Two-dimensional neighbor curve required');
    const [real, imaginary] = pair;
    const magnitude = f(hypotf(real, imaginary));
    if (!(magnitude > 0) || !Number.isFinite(magnitude)) throw new RangeError('Finite positive complex magnitude required');
    const angle = f(atan2f(imaginary, real));
    if (!Number.isFinite(angle)) throw new RangeError('Finite complex angle required');
    return {real, imaginary, magnitude, angle, logMagnitude: nativeScalarLogf(magnitude)};
  });
  return {amplitudeFloor: pairs[0].logMagnitude, phaseFloor: pairs[0].angle,
    amplitudeBlend: pairs[1].logMagnitude, phaseBlend: pairs[1].angle, pairs};
}

// 694150..6942a8 only. Decay scaling at 6942ac is a separate stage;
// do not hide it behind a fabricated unit input when its controls are absent.
export function mixNeighborExcitation({amplitude, phase, columns}, {amplitudeFloor, phaseFloor,
  amplitudeBlend, phaseBlend, floor, blend, mix}) {
  if (columns !== 3 || !amplitude?.length || amplitude.length % columns || phase?.length !== amplitude.length ||
      ![...amplitude, ...phase, amplitudeFloor, phaseFloor, amplitudeBlend, phaseBlend, floor, blend, mix].every(Number.isFinite))
    throw new RangeError('Complete finite three-column neighbor mixing inputs required');
  const a = Float32Array.from(amplitude), p = Float32Array.from(phase);
  const amplitudeGain = nativeScalarExp(fma32(f(blend), f(amplitudeBlend), f(f(amplitudeFloor) * f(floor))));
  const angle = f(fma32(f(blend), f(phaseBlend), f(f(phaseFloor) * f(floor))) + f(Math.PI));
  const tau = f(2 * Math.PI), turns = f(Math.floor(f(angle / tau)));
  const phaseDelta = f(fma32(-turns, tau, angle) - Math.PI), complement = f(1 - f(mix));
  for (let i = 2; i < a.length; i += columns) {
    a[i] = fma32(f(mix), f(amplitudeGain * a[i - 1]), f(complement * a[i]));
    p[i] = fma32(f(mix), f(p[i - 1] + phaseDelta), f(complement * p[i]));
  }
  return {amplitude: a, phase: p, amplitudeGain, phaseDelta};
}
