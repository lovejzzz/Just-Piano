// 692ffc position correction, with both optional phase flags disabled.
import { fma32 } from './modal-kernel.mjs';
import { nativeScalarLogf } from './native-scalar-log.mjs';
import { nativeScalarExp } from './native-scalar-exp.mjs';
const f32 = Math.fround;

export function correctExcitationPosition({ amplitude, columns, coordinates, sineWeights,
  referencePosition, positionFactor, positionScale, amplitudeReference, logOffsetSlope,
  amplitudePositionFlag, phasePositionFlag }, { sinf } = {}) {
  if (!Number.isInteger(columns) || columns < 1 || columns > 3 || !amplitude.length || amplitude.length % columns ||
      coordinates.length < amplitude.length / columns || !sineWeights.length || sineWeights[0] <= 0 ||
      ![...amplitude, ...coordinates, ...sineWeights, referencePosition, positionFactor, positionScale,
        amplitudeReference, logOffsetSlope].every(Number.isFinite) || amplitude.some(x => x < 0) || amplitudeReference <= 0 ||
      amplitudePositionFlag !== 0 || phasePositionFlag !== 0 || typeof sinf !== 'function')
    throw new RangeError('Complete position inputs, explicit sinf and supported disabled phase flags required');
  const position = f32(f32(positionFactor) * f32(positionScale));
  const result = Array.from(amplitude, f32), rows = amplitude.length / columns, rowControls = [];
  const changed = Math.abs(f32(f32(referencePosition) - position)) > 0.0001;
  if (!changed) return { amplitude: result, position, changed, rowControls };
  const weighted = (coordinate, point) => {
    let sum = 0, j = 1;
    // Eight-term prefix rounds products before its sequential additions.
    const prefixEnd = 1 + Math.floor((sineWeights.length - 1) / 8) * 8;
    for (; j < prefixEnd; j++) {
      const angle = f32(((((2 * j - 1) * Math.PI) * f32(coordinate))) * point);
      sum = f32(sum + f32(f32(sineWeights[j]) * f32(sinf(angle))));
    }
    for (; j < sineWeights.length; j++) {
      const angle = f32(((((2 * j - 1) * Math.PI) * f32(coordinate))) * point);
      sum = fma32(f32(sineWeights[j]), f32(sinf(angle)), sum);
    }
    return sum;
  };
  for (let row = 0; row < rows; row++) {
    const referenceSum = weighted(coordinates[row], f32(referencePosition));
    const positionSum = weighted(coordinates[row], position);
    const fade = f32(1 - f32(f32(row) / f32(rows)));
    const before = Math.max(f32(sineWeights[0]), f32(fade * Math.abs(referenceSum)));
    const after = Math.max(f32(sineWeights[0]), f32(fade * Math.abs(positionSum)));
    const ratio = f32(after / before), logRatio = nativeScalarLogf(ratio);
    const offset = f32(f32(logOffsetSlope) * f32(coordinates[row]));
    rowControls.push({ referenceSum, positionSum, fade, before, after, ratio, logRatio, offset });
    for (let component = 0; component < columns; component++) {
      const i = row * columns + component;
      if (result[i] === 0) continue;
      const log = nativeScalarLogf(f32(result[i] / f32(amplitudeReference)));
      const exponent = f32(f32(f32(offset + log) + logRatio) - offset);
      result[i] = f32(f32(amplitudeReference) * nativeScalarExp(exponent));
    }
  }
  return { amplitude: result, position, changed, rowControls };
}
