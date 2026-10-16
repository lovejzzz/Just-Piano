// 194ad8..194ca4: prepare 2ff628's four float arguments. Frequency-grid
// coordinates/curves are copied from B+2eb0 by 714530, not fitted to output.
import { fma32 } from './modal-kernel.mjs';
import { modePoleInputs } from './modal-source.mjs';
import { impedanceCurvePair, impedancePhaseCurve } from './modal-impedance.mjs';
const fl = Math.fround;

export function couplingArguments({ fundamental, endpoint, coordinateScale, mode, note,
  frequencyGrid, runtimeCurveModes }) {
  if (endpoint.kind !== 'coupled') throw new RangeError('Separate-component extra dB needs native log10f');
  if (![fundamental, coordinateScale, mode, note].every(Number.isFinite)) throw new RangeError('Finite source parameters required');
  const { coordinates, curves } = frequencyGrid;
  if (!coordinates.length || coordinates.length !== curves.length || runtimeCurveModes.length !== curves.length)
    throw new RangeError('Explicit frequency grid and runtime curve modes required');
  const selection = impedanceCurvePair(coordinates, note);
  const center = fl(modePoleInputs({ ...endpoint, mode }).center);
  const sample = index => impedancePhaseCurve({ ...curves[index], ...runtimeCurveModes[index] }, center);
  const left = sample(selection.left), right = sample(selection.right);
  const blend = fma32(left, fl(1 - selection.fraction), fl(right * selection.fraction));
  // 102ee8 supplies zero in the coupled branch; 194c9c performs a separate
  // float addition even at this endpoint. The separate branch is rejected above.
  const extraDb = fl(0 + blend);
  return { inputs: { s0: fl(fundamental), s1: fl(endpoint.base * fl(coordinateScale)), s2: center, s3: extraDb },
    selection, leftValue: left, rightValue: right, baseExtraDb: 0 };
}

export function archiveCouplingGrid(baseFields) {
  const control = baseFields.find(row => row.object_offset === 0x2a38)?.value;
  if (!control?.curve_list478) throw new RangeError('Missing decoded B+2eb0 frequency grid');
  return control.curve_list478;
}
