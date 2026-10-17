// 194ad8..194ca4: prepare 2ff628's four float arguments. Frequency-grid
// coordinates/curves are copied from B+2eb0 by 714530, not fitted to output.
import { fma32 } from './modal-kernel.mjs';
import { modePoleInputs } from './modal-source.mjs';
import { impedanceCurvePair, impedancePhaseCurve } from './modal-impedance.mjs';
import {nativeScalarLog10f} from './native-scalar-log10.mjs';
const fl = Math.fround;

// 102b40..102b78 / 10316c..10318c / 103300..103310: copied power vector,
// repeated last element when short, then float log10f and float multiply by 10.
export function separateComponentExtraDb(componentPowerScale,component){
  if(!componentPowerScale?.length || !Number.isInteger(component) || component<0)
    throw new RangeError('Explicit nonempty power vector and nonnegative component index required');
  const sourceIndex=Math.min(component,componentPowerScale.length-1),power=fl(componentPowerScale[sourceIndex]);
  if(!Number.isFinite(power)||!(power>0))throw new RangeError('Positive finite float32 component power required');
  const logarithm=nativeScalarLog10f(power);
  return {sourceIndex,power,logarithm,extraDb:fl(10*logarithm)};
}

export function couplingArguments({ fundamental, endpoint, coordinateScale, mode, note,
  frequencyGrid, runtimeCurveModes, componentPowerScale }) {
  if (!['coupled','separate'].includes(endpoint.kind)) throw new RangeError('Explicit coupled or separate endpoint required');
  if(endpoint.kind==='separate' && (endpoint.offsets?.length!==1 || endpoint.spread?.length!==1))
    throw new RangeError('Separate endpoint must contain exactly one component');
  if (![fundamental, coordinateScale, mode, note].every(Number.isFinite)) throw new RangeError('Finite source parameters required');
  const { coordinates, curves } = frequencyGrid;
  if (!coordinates.length || coordinates.length !== curves.length || runtimeCurveModes.length !== curves.length)
    throw new RangeError('Explicit frequency grid and runtime curve modes required');
  const selection = impedanceCurvePair(coordinates, note);
  const center = fl(modePoleInputs({ ...endpoint, mode }).center);
  const sample = index => impedancePhaseCurve({ ...curves[index], ...runtimeCurveModes[index] }, center);
  const left = sample(selection.left), right = sample(selection.right);
  const blend = fma32(left, fl(1 - selection.fraction), fl(right * selection.fraction));
  // 102ee8 supplies zero in the coupled branch; 103310 supplies 10*log10f
  // of component power in the separate branch. Keep 194c9c's float addition.
  const power=endpoint.kind==='separate'?separateComponentExtraDb(componentPowerScale,endpoint.component):undefined;
  const baseExtraDb=power?.extraDb??0,extraDb = fl(baseExtraDb + blend);
  return { inputs: { s0: fl(fundamental), s1: fl(endpoint.base * fl(coordinateScale)), s2: center, s3: extraDb },
    selection, leftValue: left, rightValue: right, baseExtraDb,
    ...(power?{componentPower:power}:{} )};
}

export function archiveCouplingGrid(baseFields) {
  const control = baseFields.find(row => row.object_offset === 0x2a38)?.value;
  if (!control?.curve_list478) throw new RangeError('Missing decoded B+2eb0 frequency grid');
  return control.curve_list478;
}
