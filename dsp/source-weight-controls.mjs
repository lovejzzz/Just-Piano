// Weight-transform arguments at 4cb5bc..4cb68c; helpers 2a4514/667e54/92b770.
import { impedancePhaseCurve } from './modal-impedance.mjs';
const f = Math.fround;
export function archiveWeightControls({baseFields, presetFields, note, runtimeCurveModes}) {
  if (!Number.isFinite(note) || note < 0 || note > 127)
    throw new RangeError('Finite note coordinate required');
  const get = (fields, offset) => {
    const row = fields?.find(r => r.object_offset === offset);
    if (!row) throw new RangeError('Missing weight field 0x' + offset.toString(16));
    return row.value;
  };
  const curve = (name, value) => {
    const mode = runtimeCurveModes?.[name];
    if (!mode || ![0,1].includes(mode.flags) || mode.special !== 0 || mode.dimension !== 1 ||
        !Array.isArray(value?.x) || !Array.isArray(value.y) || !value.y.length ||
        (value.x.length ? value.x.length !== value.y.length : value.y.length !== 1) ||
        ![...value.x, ...value.y].every(Number.isFinite))
      throw new RangeError('Explicit ordinary scalar curve mode required: ' + name);
    return impedancePhaseCurve({...value, ...mode}, f(note));
  };
  const presetFlag = get(presetFields, 0x1024), baseFlag = get(baseFields, 0x18c8);
  if (![presetFlag, baseFlag].every(x => Number.isInteger(x) && x >= 0 && x <= 0xffffffff))
    throw new RangeError('Unsigned weight activation flags required');
  const s0 = presetFlag !== 0 || baseFlag !== 0 ? f(get(presetFields, 0x1020)) : 1;
  if (!Number.isFinite(s0)) throw new RangeError('Finite base-spectrum blend required');
  const multiplier = f(get(presetFields, 0x8a0));
  if (!Number.isFinite(multiplier)) throw new RangeError('Finite weight multiplier required');
  const evaluated = {
    B17d8: curve('B17d8', get(baseFields, 0x17d8)),
    A8a8: curve('A8a8', get(presetFields, 0x8a8)),
    B1828: curve('B1828', get(baseFields, 0x1828)),
    B1878: curve('B1878', get(baseFields, 0x1878)),
  };
  // Preserve the two separate float multiplications and float 0.1 bound.
  const s1 = Math.min(10, Math.max(f(0.1), f(f(evaluated.B17d8 * evaluated.A8a8) * multiplier)));
  return {controls: {s0, s1, s2: evaluated.B1828, s3: evaluated.B1878}, evaluated,
    completeWeightInputsComputed: false};
}
