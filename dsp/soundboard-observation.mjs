// Observation records prepared by FUN_10037e040 inside SoundboardIRCompute.
// The native parameter types are obscured by decompilation, so the caller
// supplies the two scalar scales and the two input vectors explicitly.
const f = Math.fround;
const TWO_PI = 12.566371;

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
  cosf = Math.cos,
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
  for (let frequencyIndex = 0; frequencyIndex < count; frequencyIndex++) {
    const frequency = frequencies[frequencyIndex];
    const scaledFrequency = f(inverseScale * frequency);
    let phaseWeight = 1;
    if (phaseMode) {
      const fraction = f(scaledFrequency - Math.trunc(scaledFrequency));
      const cosine = f(cosf(f(fraction * 1.5707964)));
      phaseWeight = f(cosine * cosine);
    }
    const stateIndex = Math.trunc(scaledFrequency);
    const angularFrequency = f(frequency * TWO_PI);
    let first;
    let second;
    if (flags & 1) {
      const coefficient = coefficients[frequencyIndex];
      const reciprocal = f(1 / f(frequency * angularFrequency));
      const inverseOmega = f(1 / angularFrequency);
      first = f(f(amplitudeScale * f(reciprocal + f(inverseOmega * inverseScale))) * coefficient);
      second = f(f(f(amplitudeScale * inverseScale) * f(-inverseOmega)) * coefficient);
    } else {
      first = f(amplitudeScale * f(1 / angularFrequency));
      second = 0;
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
