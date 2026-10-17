// Source-table preparation recovered from 1026dc / 194870 / 182960 / 7a4014.
// Callers supply model tables and unrecovered transcendental/config values.
import {nativeScalarPowf} from './native-scalar-pow.mjs';
import {nativeDoublePow} from './native-double-pow.mjs';
import { fma64 } from './modal-poles.mjs';
const f32 = Math.fround;

export function archiveModalSource(bank, noteIndex) {
  const fields = new Map(bank.fields.map(field => [field.object_offset, field.value]));
  const row = fields.get(0x1c40)?.[noteIndex - 1];
  const scale = fields.get(0x1c58)?.[noteIndex - 1];
  const compound = fields.get(0x2548);
  if (!row?.length || scale === undefined || !compound) throw new RangeError('No decoded modal source for this note index');
  return {
    coordinates: Float32Array.from(row), coordinateScale: f32(scale),
    offsetExponent: f32(fields.get(0x1bec)),
    frequencyRatios: Float32Array.from(compound.vectors[0]),
    componentAmplitudeScale: Float32Array.from(compound.vectors[1]),
    componentPowerScale: Float32Array.from(compound.vectors[2]),
    blend: f32(compound.scalar9d),
  };
}

export function modalOffsetScale(frequency,exponent){
  frequency=f32(frequency);exponent=f32(exponent);
  if(!(frequency>0)||!Number.isFinite(frequency)||!Number.isFinite(exponent))throw new RangeError('Finite positive modal frequency and finite exponent required');
  return nativeScalarPowf(f32(frequency/440),exponent);
}

export function prepareModalInputs({ frequency, offsets, offsetExponent, stiffness,
  componentStiffness, spread, frequencyRatios, blend, offsetScale }) {
  frequency = f32(frequency); stiffness = f32(stiffness); spread = f32(spread);
  offsetExponent = f32(offsetExponent); blend = f32(blend);
  const count = offsets.length;
  if (!count || !componentStiffness.length || !frequencyRatios.length) throw new RangeError('Missing component model vectors');
  // Match the recovered scalar powf, including the native float32 division.
  // Explicit offsetScale remains available to older diagnostic callers.
  const offsetScaleComputed=offsetScale===undefined;
  if(offsetScaleComputed)offsetScale=modalOffsetScale(frequency,offsetExponent);
  const scaledOffsets = Float32Array.from(offsets, value => f32(f32(value) * f32(offsetScale)));
  const slope = f32(f32(componentStiffness[0]) * spread);
  const spreadVector = Float32Array.from(offsets, (_, j) => f32(f32(f32(j) * slope) / 100));
  const endpoints = [];
  if (blend > 0) {
    let sum = 0;
    for (const value of scaledOffsets) sum = f32(sum + value);
    const mean = f32(sum / f32(count));
    const divisor = Math.sqrt(stiffness + 1);
    const referenceFrequency=f32(f32(frequency+mean)/f32(frequencyRatios[0]));
    endpoints.push({ kind: 'coupled', reference: frequency / divisor,referenceFrequency,
      base: referenceFrequency / divisor,
      stiffness, offsets: scaledOffsets, spread: spreadVector });
  }
  if (blend < 1) {
    for (let j = 0; j < count; j++) {
      const componentB = f32(componentStiffness[Math.min(j, componentStiffness.length - 1)]);
      const ratio = f32(frequencyRatios[Math.min(j, frequencyRatios.length - 1)]);
      const divisor = Math.sqrt(componentB + 1);
      const referenceFrequency=f32(f32(frequency+scaledOffsets[j])/ratio);
      endpoints.push({ kind: 'separate', component: j, reference: frequency / divisor,referenceFrequency,
        base: referenceFrequency / divisor,
        stiffness: componentB, offsets: scaledOffsets.slice(j, j + 1), spread: spreadVector.slice(j, j + 1) });
    }
  }
  return { scaledOffsets, spreadVector, endpoints, blend, nativeOffsetScale: f32(offsetScale), offsetScaleComputed };
}

export function modePoleInputs({ reference, base, stiffness, mode, offsets, spread }) {
  mode = f32(mode);
  const permutation = Array.from(offsets, (_, j) => j).sort((a, b) => offsets[a] - offsets[b]);
  if (spread.length !== offsets.length || !spread.length) throw new RangeError('Component vectors must have equal nonzero lengths');
  const squared = mode * mode;
  const center = (base * mode) * Math.sqrt(fma64(stiffness + f32(spread[0]), squared, 1));
  const lambda = Array.from(offsets, (offset, j) => {
    const correction = fma64(squared * f32(spread[permutation[j]]), 0.5, 1);
    return fma64(reference, correction, f32(offset));
  });
  return { center, lambda, permutation };
}

// Weight table transformation only when both frequency ratios are exactly .5.
export function specialHalfRatioWeights(weights, frequencyRatios) {
  if (frequencyRatios.length !== 2 || frequencyRatios[0] !== 0.5 || frequencyRatios[1] !== 0.5) return Float32Array.from(weights);
  return Float32Array.from(weights, (_, j) => f32(weights[Math.min(2 * j + 1, weights.length - 1)]));
}

export function sourceAmplitudeRow(decayInput, weight, { addedDecay, shape, eta = 1, integerScale, pow }) {
  const n = decayInput.length;
  if (!Number.isFinite(integerScale)) throw new RangeError('Native integer amplitude scale must be supplied');
  if (eta !== 1 && shape >= 0.5 && typeof pow !== 'function') throw new RangeError('Native scalar pow dependency must be supplied');
  if (!n || decayInput[0] <= 0) throw new RangeError('Positive first decay is required');
  shape = f32(shape); eta = f32(eta); addedDecay = f32(addedDecay); weight = f32(weight);
  const amplitude = new Float32Array(n); amplitude[0] = 1;
  const first = f32(decayInput[0]);
  for (let j = 1; j < n; j++) {
    const ratio = f32(f32(decayInput[j]) / Math.max(first, f32(1e-10)));
    const amount = eta === 1 ? 0 : shape >= 0.5
      ? (1 - eta) * pow(ratio, f32(shape * -3) + 3.5)
      : ((1 - eta) * f32(shape + shape)) * f32(ratio * ratio);
    amplitude[j] = f32(eta + amount);
  }
  const common = f32(f32(addedDecay * f32(0.01)) * first);
  const decay = Float32Array.from(decayInput, value => f32(common + f32(value)));
  // Products and sums of each pair are float32; quotient and accumulation are
  // double (18304c..183078), not an all-float sum inferred from pseudocode.
  let energy = 0;
  for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const denominator = f32(decay[j] + decay[k]);
    if (Math.abs(denominator) < 1e-20) throw new RangeError('Near-zero modal normalization denominator');
    energy += f32(amplitude[j] * amplitude[k]) / denominator;
  }
  for (let j = 0; j < n; j++) amplitude[j] = f32(integerScale * f32((weight / Math.sqrt(energy)) * amplitude[j]));
  return { decay, amplitude, energy };
}

export function normalizeSourceAmplitudes(values) {
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, Math.abs(f32(value)));
  const scale = f32(1 / maximum);
  return { values: Float32Array.from(values, value => f32(f32(value) * scale)), maximum, scale };
}

export function referenceModeIndex(frequency, columns, target) {
  let best = -1, distance = -1;
  for (let row = 0; row < frequency.length / columns; row++) {
    const next = Math.abs(f32(f32(frequency[row * columns]) - f32(target)));
    if (row === 0 || next < distance) { best = row; distance = next; }
  }
  return best;
}

export function sourcePhaseTable(rows, columns, amount, phaseConstant) {
  amount = f32(amount);
  const output = new Float32Array(rows * columns);
  if (amount === 0) return output;
  if (!Number.isFinite(phaseConstant)) throw new RangeError('Observed native phase constant is required');
  let x = 0x2983, y = 0x6b09c700, z = 0x77cbeb39, w = 0x8a94b57e;
  const scale = (phaseConstant + phaseConstant) * amount;
  for (let j = 0; j < output.length; j++) {
    const t = (x ^ (x << 11)) >>> 0;
    x = y; y = z; z = w;
    w = ((w >>> 19) ^ (t >>> 8) ^ w ^ t) >>> 0;
    const centered = f32(f32(w / 4294967296) - 0.5);
    output[j] = f32(scale * centered);
  }
  return output;
}

// Construct the source tables from upstream computed poles/weights. All model
// controls and registry constants remain explicit; no captured target is read.
export function constructModalSource({frequency, rawDecay, weights, columns,
  addedDecay, shape, eta, integerScale, phaseAmount, phaseConstant, referenceFrequency},
  {pow = nativeDoublePow} = {}) {
  if (!Number.isInteger(columns) || columns < 1 || !frequency?.length ||
      frequency.length % columns || rawDecay?.length !== frequency.length ||
      !weights?.length || weights.length < frequency.length / columns || typeof pow !== 'function' ||
      ![...frequency, ...rawDecay, ...weights, addedDecay, shape, eta, integerScale,
        phaseAmount, phaseConstant, referenceFrequency].every(Number.isFinite) || referenceFrequency <= 0)
    throw new RangeError('Complete finite modal source matrices and explicit controls required');
  const rows = frequency.length / columns, decay = new Float32Array(frequency.length), amplitude = new Float32Array(frequency.length);
  for (let row = 0; row < rows; row++) {
    const start = row * columns;
    const source = sourceAmplitudeRow(rawDecay.slice(start, start + columns), weights[row],
      {addedDecay, shape, eta, integerScale, pow});
    decay.set(source.decay, start); amplitude.set(source.amplitude, start);
  }
  const normalization = normalizeSourceAmplitudes(amplitude);
  return {rows, columns, frequency: Float32Array.from(frequency), rawDecay: Float32Array.from(rawDecay), decay, amplitude,
    phase: sourcePhaseTable(rows, columns, phaseAmount, phaseConstant),
    normalizedAmplitude: normalization.values, normalizationMaximum: normalization.maximum, normalizationScale: normalization.scale,
    referenceIndex: referenceModeIndex(frequency, columns, referenceFrequency)};
}
