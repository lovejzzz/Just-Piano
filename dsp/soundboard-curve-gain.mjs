import {fma32} from './modal-kernel.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
import {smoothSoundboardSpectrum} from './soundboard-spectrum-smoothing.mjs';
const f = Math.fround;
const dbScale = new Float32Array(new Uint32Array([0x3debc8e3]).buffer)[0];

// Runtime curve mode 2 extrapolates both ends; mode bytes are explicit guards.
export function soundboardCurveGain({x, y, dimensions, mode, logX},
  {length, smoothingWidth, mix, binSpacing}) {
  if (!(x instanceof Float32Array) || !(y instanceof Float32Array) ||
      ![1, 2].includes(dimensions) || mode !== 0 || logX !== 0 ||
      y.length !== Math.max(1, x.length) * dimensions ||
      x.some((v, i) => !Number.isFinite(v) || (i && v <= x[i - 1])) ||
      y.some((v) => !Number.isFinite(v)) || !Number.isInteger(length) || length < 1 ||
      ![smoothingWidth, mix, binSpacing].every((v) => Number.isFinite(v) && Number.isFinite(f(v))) ||
      !(f(smoothingWidth) > 0) || !(f(binSpacing) > 0)) {
    throw new RangeError('Supported linear curve and finite gain controls required');
  }
  const interpolated = new Float32Array(length * dimensions);
  const beforeSmoothing = new Float32Array(length);
  const blend = f(mix), complement = f(1 - blend);
  let segment = 0;
  for (let i = 0; i < length; i++) {
    const frequency = f(f(i) * f(binSpacing));
    while (segment < x.length - 2 && frequency >= x[segment + 1]) segment++;
    let t = 0;
    if (x.length > 1) {
      const delta = f(x[segment + 1] - x[segment]);
      t = delta > 1e-30 ? f(f(frequency - x[segment]) / delta) : 1;
    }
    for (let dimension = 0; dimension < dimensions; dimension++) {
      interpolated[i * dimensions + dimension] = x.length < 2 ? y[dimension] :
        fma32(f(1 - t), y[segment * dimensions + dimension],
          f(t * y[(segment + 1) * dimensions + dimension]));
    }
    const db = dimensions === 1 ? interpolated[i] :
      fma32(complement, interpolated[i * 2], f(blend * interpolated[i * 2 + 1]));
    beforeSmoothing[i] = db === 0 ? 1 : nativeScalarExp(f(db * dbScale));
  }
  const output = smoothSoundboardSpectrum(beforeSmoothing, f(f(binSpacing) / f(smoothingWidth))).output;
  if (interpolated.some((v) => !Number.isFinite(v)) || beforeSmoothing.some((v) => !Number.isFinite(v))) {
    throw new RangeError('Non-finite curve gain');
  }
  return {interpolated, beforeSmoothing, output};
}
