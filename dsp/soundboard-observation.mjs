// Observation records prepared by FUN_10037e040 inside SoundboardIRCompute.
// Historical API names: `frequencies` contains geometric distances, and
// `stateIndex` is the delayed output index. Native same-run proof: pass226.
import {fma32} from './modal-kernel.mjs';
import {nativeScalarCos} from './native-scalar-sin.mjs';
const f = Math.fround;
const FOUR_PI = 4 * Math.PI;

function finiteArray(values, name, count) {
  if (!Array.isArray(values) && !(values instanceof Float32Array)) {
    throw new RangeError(`${name} array required`);
  }
  if (count !== undefined && values.length < count) throw new RangeError(`${name} is too short`);
  for (let index = 0; index < (count ?? values.length); index++) {
    if (!Number.isFinite(values[index])) throw new RangeError(`${name} contains a non-finite value`);
  }
}

export function prepareSoundboardObservations({
  inverseScale,
  amplitudeScale,
  frequencies,
  coefficients = null,
  flags = 0,
  phaseMode = false,
  count = frequencies.length,
  cosf = nativeScalarCos,
}) {
  if (!Number.isFinite(inverseScale) || !Number.isFinite(amplitudeScale)) {
    throw new RangeError('Finite observation scales required');
  }
  finiteArray(frequencies, 'frequency', count);
  if (!Number.isInteger(count) || count < 0) throw new RangeError('Nonnegative integer count required');
  if (flags & 1) {
    finiteArray(coefficients, 'coefficient', count);
  }
  if (typeof cosf !== 'function') throw new RangeError('cosf callback required');

  const records = [];
  if (amplitudeScale === 0) return records;
  for (let frequencyIndex = 0; frequencyIndex < count; frequencyIndex++) {
    const frequency = frequencies[frequencyIndex];
    const scaledFrequency = f(inverseScale * frequency);
    let phaseWeight = 1;
    const stateIndex = Math.max(0, phaseMode ? Math.floor(scaledFrequency) : Math.floor(scaledFrequency + 0.5));
    if (phaseMode) {
      const fraction = f(scaledFrequency - Math.floor(scaledFrequency));
      const cosine = f(cosf(f(fraction * f(1.5707964))));
      phaseWeight = f(cosine * cosine);
    }
    const angularFrequency = f(frequency * FOUR_PI);
    let first;
    let second;
    if (flags & 1) {
      const coefficient = coefficients[frequencyIndex];
      const reciprocal = f(1 / f(frequency * angularFrequency));
      const inverseOmega = f(1 / angularFrequency);
      first = f(amplitudeScale * f(fma32(inverseScale, inverseOmega, reciprocal) * coefficient));
      second = f(amplitudeScale * f(f(inverseScale * f(-1 / angularFrequency)) * coefficient));
    } else {
      first = f(amplitudeScale * f(1 / angularFrequency));
      second = f(amplitudeScale * 0);
    }
    records.push({
      stateIndex,
      frequencyIndex,
      phaseWeight,
      first,
      second,
    });
  }
  return records;
}
