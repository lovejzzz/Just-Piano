// 6e5540..5694: note-age-dependent pitch transient, separate from the modal
// history projection that consumes it. Native exp2f for nonzero cents remains
// an explicit dependency; scalar expf has a browser implementation.
import { fma32 } from './modal-kernel.mjs';
import { nativeScalarExp, nativeScalarExp2f } from './native-scalar-exp.mjs';
const f = Math.fround;

export function dynamicPitchStep(input, state = { disabled: false }, math = {}) {
  const { sampleAge, timestep, centsA, centsB, strength, relaxation, velocityScale,
    modalDecay, exponentialBranch, released, releaseRule, damperFlag, releaseAmount, smoothedRatio } = input;
  if (!Number.isInteger(sampleAge) || sampleAge < 0 || sampleAge > 0xffffffff ||
      ![timestep, centsA, centsB, strength, relaxation, velocityScale, modalDecay, releaseAmount, smoothedRatio].every(Number.isFinite) ||
      timestep <= 0 || typeof exponentialBranch !== 'boolean' || typeof released !== 'boolean' ||
      typeof releaseRule !== 'boolean' || typeof damperFlag !== 'boolean' || typeof state.disabled !== 'boolean')
    throw new RangeError('Finite dynamic-pitch controls and explicit flags required');
  const cents = f(f(centsA) + f(centsB));
  let basePitch = 1;
  if (cents !== 0) {
    if (typeof math.exp2f !== 'function') throw new TypeError('Explicit native exp2f required for cents adjustment');
    basePitch = f(math.exp2f(f(cents * f(1 / 1200))));
  }
  const time = f(f(timestep) * f(sampleAge));
  const result = { basePitch, pitch: basePitch, time, exponent: null, exponential: null, offset: 0,
    disabled: state.disabled, applied: false };
  if (state.disabled || (exponentialBranch && f(strength) === 0)) return result;
  let numerator;
  if (exponentialBranch) {
    const exponent = f(-f(modalDecay) * time), exponential = nativeScalarExp(exponent);
    const scaled = f(f(velocityScale) * exponential);
    numerator = f(f(strength) * f(scaled * scaled));
    Object.assign(result, { exponent, exponential });
  } else if (!released) {
    numerator = f(f(strength) * f(f(velocityScale) * f(velocityScale)));
  } else {
    if (releaseRule && (damperFlag || f(releaseAmount) >= 0.05)) return result;
    result.disabled = true;
    // The native branch retains the separate smoothed-ratio value here.
    result.pitch = smoothedRatio === 1 ? basePitch : f(basePitch * f(smoothedRatio));
    result.applied = smoothedRatio !== 1;
    return result;
  }
  const denominator = fma32(time, relaxation, 1), offset = f(numerator / denominator);
  result.offset = offset;
  if (Math.abs(offset) <= 1e-5) { result.disabled = true; return result; }
  const factor = f(offset + 1);
  if (factor !== 1) { result.pitch = f(basePitch * factor); result.applied = true; }
  return result;
}

// Own age and latch across blocks. The fixed producer controls are explicit;
// no target trajectory or per-block capture is consumed by this runtime.
export class DynamicPitchTrajectory {
  constructor(controls) {
    this.controls = Object.freeze({...controls});
    this.counter = 0;
    this.disabled = false;
    dynamicPitchStep({...this.controls, sampleAge: 0}, {disabled: false}, {exp2f: nativeScalarExp2f});
  }
  next(samples) {
    if (!Number.isInteger(samples) || samples <= 0 || this.counter + samples > 0xffffffff)
      throw new RangeError('Positive nonwrapping pitch block size required');
    const result = dynamicPitchStep({...this.controls, sampleAge: this.counter},
      {disabled: this.disabled}, {exp2f: nativeScalarExp2f});
    const counter = this.counter;
    this.disabled = result.disabled;
    this.counter += samples;
    return {counter, ...result};
  }
}
