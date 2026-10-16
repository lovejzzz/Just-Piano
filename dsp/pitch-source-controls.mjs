// Static reconstruction: 1c5320 -> 715f98 -> 43dcb0.
// Dynamic host78/host80 remain explicit inputs; no audio-state inference.
import { fma32 } from './modal-kernel.mjs';
import { linearModelCurve } from './model-curves.mjs';
const f = Math.fround;
const words = new DataView(new ArrayBuffer(4));
const fw = value => { words.setUint32(0, value); return words.getFloat32(0); };

export function pitchVoiceSource({ baseStrength, baseDecay, baseType, host78, host80 }) {
  if (![baseStrength, baseDecay, host78, host80].every(Number.isFinite) || !Number.isInteger(baseType))
    throw new TypeError('Finite pitch controls and integer base type required');
  let strength = f(baseStrength), decay = f(baseDecay);
  host78 = f(host78); host80 = f(host80);
  let alpha = 0;
  // 718600 skips this entire blend at host78 <= 1. The native upper clamp
  // precedes division by 0.1; alpha can exceed one and is not reclamped.
  if (host78 > 1) {
    const shifted = f(host78 + fw(0xbf99999a));
    alpha = shifted < 0 ? 0 : f(Math.min(shifted, 1) / fw(0x3dcccccd));
    const complement = f(1 - alpha);
    strength = fma32(strength, complement, f(f(strength + fw(0x3c23d70a)) * alpha));
    decay = fma32(decay, complement, f(20 * alpha));
  }
  return { strength, decay, velocityScale: host80, exponentialBranch: baseType === 0,
    initialDisabled: false, alpha };
}

export function archivePitchSourceControls({ baseFields, note, host78, host80, runtimeCurveMode }) {
  if (!Number.isFinite(note)) throw new TypeError('Finite actual G+14 note coordinate required');
  const fields = new Map(baseFields.map(row => [row.object_offset, row.value]));
  const mar = fields.get(0x2f10);
  // Full modern archive reader keeps mar_param fields relative to B+2f10.
  if (mar?.fields) for (const row of mar.fields) fields.set(0x2f10 + row.object_offset, row.value);
  const scalar = offset => {
    const values = linearModelCurve(fields.get(offset), f(note), { runtimeMode: runtimeCurveMode });
    if (values.length !== 1) throw new RangeError(`Scalar base curve required at 0x${offset.toString(16)}`);
    return values[0];
  };
  const baseStrength = scalar(0x3a90), baseDecay = scalar(0x3ae0);
  const result = pitchVoiceSource({ baseStrength, baseDecay, baseType: fields.get(0x158), host78, host80 });
  return { ...result, baseStrength, baseDecay, note: f(note) };
}

// 57e4d8 -> 51a700, the captured shared-mode-zero branch. Callbacks are
// explicit: correctly rounded double Math.log/exp are not float libm oracles.
export function velocityScaleFromControls({ host78, hostMode, host2fe0, gA0, gC0,
  shared8c, shared90, sharedMode, velocityCurve, runtimeCurveMode }, math) {
  if (![host78, host2fe0, gA0, gC0, shared8c, shared90].every(Number.isFinite) ||
      !Number.isInteger(hostMode) || !Number.isInteger(sharedMode))
    throw new TypeError('Finite velocity controls and integer modes required');
  if (hostMode === 2) return { velocityScale: 1, bypass: true };
  if (sharedMode !== 0) throw new RangeError('Only shared velocity mode zero is implemented');
  if (typeof math?.logf !== 'function' || typeof math?.expf !== 'function')
    throw new TypeError('Explicit float logf and expf dependencies required');
  host78 = f(host78); host2fe0 = f(host2fe0); gA0 = f(gA0); gC0 = f(gC0);
  shared8c = f(shared8c); shared90 = f(shared90);
  const curveCoordinate = f(host78 * fw(0x3f810204));
  const curveValues = linearModelCurve(velocityCurve, curveCoordinate, { runtimeMode: runtimeCurveMode });
  if (curveValues.length !== 1) throw new RangeError('Scalar velocity curve required');
  const curveValue = curveValues[0], scaledVelocity = f(host78 * shared8c);
  let helperScale = 0, logInput = null, logValue = null, expInput = null, expValue = null;
  if (scaledVelocity > 1e-8) {
    const denominator = f(f(shared8c * 3) * 0.25);
    logInput = f(scaledVelocity / denominator);
    logValue = f(math.logf(logInput));
    const multiplier = f(gA0 * shared90);
    expInput = fma32(curveValue, fw(0x3debc8e3), f(logValue * multiplier));
    expValue = f(math.expf(expInput));
    helperScale = f(expValue * fw(0x3eb5a858));
  }
  helperScale = Math.min(helperScale, 1);
  let outerGain = 1, outerExpInput = null;
  if (host2fe0 !== 0 && gC0 !== 0) {
    const product = f(host2fe0 * gC0);
    if (product !== 0) {
      outerExpInput = f(product * fw(0x3debc8e3));
      outerGain = f(math.expf(outerExpInput));
    }
  }
  return { velocityScale: f(helperScale * outerGain), bypass: false, curveCoordinate,
    curveValue, scaledVelocity, logInput, logValue, expInput, expValue, helperScale,
    outerGain, outerExpInput };
}
