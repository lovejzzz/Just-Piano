// Recovered preparation-stage spectrum arithmetic. This is not a contact-force
// solver or a preset/model table library.
import { fma32 } from './modal-kernel.mjs';
import { fma64 } from './modal-poles.mjs';
import { nativeVectorExpLane } from './native-vector-exp.mjs';
const f32 = Math.fround;
const word = new DataView(new ArrayBuffer(8));
word.setBigUint64(0, 0x3fbd791c5f888823n, true);
const DB_AMPLITUDE_SCALE = word.getFloat64(0, true);

export function buildLogSpectrum({ slope, baseScale, reference, lower,
                                   coordinates, baseTable, extraTable, count = baseTable.length }) {
  if (!Number.isInteger(count) || count < 1 ||
      [coordinates, baseTable, extraTable].some(array => array.length < count)) {
    throw new RangeError('Expected complete model tables for the selected count');
  }
  slope = f32(slope); baseScale = f32(baseScale);
  reference = f32(reference); lower = f32(lower);
  const upper = slope > 0 ? 20 : 0;
  const output = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const coordinate = f32(f32(coordinates[i]) - 1);
    const product = f32(slope * f32(coordinate - reference));
    let value = fma32(baseScale, baseTable[i], Math.max(lower, Math.min(upper, product)));
    if (coordinate < count) {
      const x = Math.max(coordinate, 0);
      const a = Math.floor(x), b = Math.min(a + 1, count - 1);
      const fraction = f32(x - a);
      const extra = fma32(f32(1 - fraction), extraTable[a], f32(fraction * extraTable[b]));
      value = f32(fma64(extra, DB_AMPLITUDE_SCALE, value));
    }
    output[i] = value;
  }
  return output;
}

// Explicit approximation only. Its differences from captured vexpf must be
// measured separately; do not use it to claim exact native amplitude replay.
export function approximateExpWeights(logSpectrum) {
  return Float32Array.from(logSpectrum, value => f32(Math.exp(value)));
}

// Instruction-order reconstruction of the observed host's vexpf dependency.
export function nativeExpWeights(logSpectrum) {
  return Float32Array.from(logSpectrum, nativeVectorExpLane);
}

// Accepts actual supplied weights; the caller must establish their provenance.
// Runtime evidence currently covers nonzero weights above the 1e-9 threshold.
export function applyModalWeight(amplitude, weight) {
  weight = f32(weight);
  return f32(f32(amplitude) * (weight < 1e-9 ? 0 : weight));
}
