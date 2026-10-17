// 714530 shared controls -> 57e4d8 velocity response -> 6942ac decay scaling.
import {linearModelCurve} from './model-curves.mjs';
import {velocityScaleFromControls} from './pitch-source-controls.mjs';
import {nativeScalarLog10f} from './native-scalar-log10.mjs';
import {nativeScalarLogf} from './native-scalar-log.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
import {fma32} from './modal-kernel.mjs';
const f = Math.fround;

export function archiveExcitationDecayControls(base, preset, note, {runtimeCurveMode} = {}) {
  const b = new Map(base.fields?.map(row => [row.object_offset, row.value]));
  const a = new Map(preset.decoded_tail?.fields?.map(row => [row.object_offset, row.value]));
  const baseDynamic = a.get(0xc80), noteDynamic = linearModelCurve(a.get(0xc88), note, {runtimeMode: runtimeCurveMode});
  const velocityCurve = b.get(0x1788), shared8c = b.get(0x168), sharedDecayStrength = b.get(0x170), sharedMode = a.get(0x1084);
  if (noteDynamic.length !== 1 || ![baseDynamic, shared8c, sharedDecayStrength].every(Number.isFinite) ||
      !(shared8c > 1) || !Number.isInteger(sharedMode) || !velocityCurve?.x || !velocityCurve.y)
    throw new RangeError('Complete scalar dynamics controls and base velocity curve required');
  const curveScale = Math.min(f(f(baseDynamic) / 50), 1);
  const shared90 = f(1 / f(20 * nativeScalarLog10f(f(shared8c))));
  return {gA0: f(f(baseDynamic) + noteDynamic[0]), shared8c: f(shared8c), shared90,
    sharedDecayStrength: f(sharedDecayStrength), sharedMode, curveScale,
    velocityCurve: {...velocityCurve, y: velocityCurve.y.map(y => f(f(y) * curveScale))}, runtimeCurveMode};
}

export function excitationDecayFromControls(controls, velocity, {hostMode, noteBranch} = {}) {
  if (!Number.isInteger(hostMode) || noteBranch !== 'ordinary')
    throw new RangeError('Explicit host mode and ordinary note branch required; special note configuration is unresolved');
  // 35f070..35f078 sets H3078=1 only in this explicitly selected branch.
  const noteScale = 1;
  // The denominator uses the helper output BEFORE 57e540's outer exponential.
  // Its expression parameters are deliberately unused; do not use final H80.
  const helper = velocityScaleFromControls({host78: velocity, hostMode, host2fe0: 0, gC0: 0,
    gA0: controls.gA0, shared8c: controls.shared8c, shared90: controls.shared90,
    sharedMode: controls.sharedMode, velocityCurve: controls.velocityCurve,
    runtimeCurveMode: controls.runtimeCurveMode}, {logf: nativeScalarLogf, expf: nativeScalarExp});
  const helperScale = helper.bypass ? 1 : helper.helperScale;
  const inputScale = hostMode === 2 ? 1 : f(1 / fma32(f(controls.sharedDecayStrength), f(1 - f(helperScale + helperScale)), 1));
  const gain = f(inputScale * noteScale);
  if (!(gain > 0) || !Number.isFinite(gain)) throw new RangeError('Finite positive excitation decay gain required');
  return {gain, inputScale, noteScale, helperScale, helper, hostMode, noteBranch};
}

export function scaleExcitationDecay(decay, gain) {
  if (!decay?.length || ![gain, ...decay].every(Number.isFinite) || !(gain > 0))
    throw new RangeError('Complete finite decay table and positive gain required');
  return Float32Array.from(decay, value => f(f(value) * f(gain)));
}
