// 714494c copies B19c8 to shared+f0; 57e5a4 evaluates it at H78.
// Params+28 is H2fe0. Shared b8/bc come from A9bc/B1a18.
import {linearModelCurve} from './model-curves.mjs';
import {runtimeCurveModeFromArchiveCurve} from './runtime-context-from-archive.mjs';
import {fma32} from './modal-kernel.mjs';
const f = Math.fround;
function field(rows, offset) {
  const found = rows?.filter(r => r.object_offset === offset);
  if (found?.length !== 1) throw new Error('Unique excitation blend field required: ' + offset.toString(16));
  return found[0].value;
}
export function archiveExcitationBlend({baseFields, presetFields, velocity, velocityRuntime}) {
  if (![0, 2].includes(velocityRuntime?.hostMode) || !Number.isFinite(velocityRuntime?.host2fe0) ||
      !Number.isFinite(velocity) || velocity < 0 || velocity > 1)
    throw new Error('Own velocity and explicit finite host expression condition required');
  const curve = field(baseFields, 0x19c8);
  runtimeCurveModeFromArchiveCurve(curve, 'excitation velocity blend B19c8');
  const input = linearModelCurve(curve, f(velocity), {runtimeMode: 'linear-clamp'});
  const h = field(presetFields, 0x9a8), second = field(baseFields, 0x1a18);
  if (input.length !== 1 || h?.version !== 10 || h.scalars?.length !== 5 ||
      ![h.scalars[4], second, f(velocityRuntime.host2fe0)].every(Number.isFinite))
    throw new Error('Complete ordinary scalar blend curve and shared coefficients required');
  return {blendFloor: f(velocityRuntime.host2fe0), inputBlend: input[0],
    sharedBlendCoefficients: [fma32(f(h.scalars[4]), f(-.8), 1), f(second)]};
}
