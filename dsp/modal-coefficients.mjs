// Reconstructed coefficient/energy-control arithmetic for the observed normal
// layout, including the observed host's vector exp and scalar log arithmetic.
import { fma32 } from './modal-kernel.mjs';
import { nativeScalarLogf } from './native-scalar-log.mjs';
const fl = Math.fround;
const word = new DataView(new ArrayBuffer(4));
function fromBits(value) {
  word.setUint32(0, value >>> 0, true);
  return word.getFloat32(0, true);
}
const C = [0x39506967, 0x3ab743ce, 0x3c088908, 0x3d2aa9c1, 0x3e2aaaaa].map(fromBits);
const LIMIT = fromBits(0x42b0c0a5);
const LOG2E = fromBits(0x3fb8aa3b);
const LN2_HIGH = fromBits(0x3f318000);
const LN2_LOW = fromBits(0x395e8083);
const FAST = [0x3efffff7, 0x3e2ad818, 0x3d2ad84f].map(fromBits);

// One lane of 1009a3048, not the external four-lane vexpf routine.
export function expPolynomial(value) {
  const x = Math.max(-LIMIT, Math.min(LIMIT, fl(value)));
  const n = Math.floor(fma32(x, LOG2E, 0.5));
  const reduced = fl(fma32(-n, LN2_HIGH, x) + fl(n * LN2_LOW));
  let y = C[0];
  for (let i = 1; i < C.length; i++) y = fma32(reduced, y, C[i]);
  y = fma32(reduced, y, 0.5);
  y = fl(fma32(fl(reduced * reduced), y, reduced) + 1);
  return fl(y * fromBits((n << 23) + 0x3f800000));
}

export function smallExpPolynomial(x) {
  x = fl(x);
  return fma32(x, fma32(x, fma32(x, fma32(x, FAST[2], FAST[1]), FAST[0]), 1), 1);
}

export function baseDecay(modalDecay, pitch, scale, release) {
  return fma32(modalDecay, fl(Math.max(1, fl(pitch)) * fl(scale)), release);
}

export function positionAdjustedDecay(base, gain, weight, normalization) {
  return fl(base + fma32(gain, weight, normalization));
}

export function recurrenceCoefficients(radius, cosine) {
  return { A: fl(-radius * radius), B: fl(fl(cosine + cosine) * radius) };
}

function reduceFour(values) {
  return fl(fl(values[0] + values[2]) + fl(values[1] + values[3]));
}

// In this observed branch the normalization uses a four-lane energy reduction
// across all padded groups. The callback defaults to double log then float32;
// its agreement with native logf is independently checked on actual inputs.
export function energyNormalization(groups, { timestep, blockLength, blockFactor, gain },
                                    logf = nativeScalarLogf) {
  const multiplier = fl(fl(fl(timestep * -2) * blockLength) * blockFactor);
  const before = [0, 0, 0, 0];
  const after = [0, 0, 0, 0];
  for (const group of groups) {
    if (group.length % 4) throw new RangeError('Padded groups required');
    for (let i = 0; i < group.length; i += 4) {
      const x = [], y = [];
      for (let lane = 0; lane < 4; lane++) {
        const mode = group[i + lane];
        x.push(fl(mode.base * multiplier));
        y.push(fl(fma32(mode.weight, gain, mode.base) * multiplier));
      }
      const fast = [...x, ...y].every((value) => Math.abs(value) <= fl(0.15));
      const exp = fast ? smallExpPolynomial : expPolynomial;
      for (let lane = 0; lane < 4; lane++) {
        const energy = group[i + lane].energy;
        before[lane] = fma32(exp(x[lane]), energy, before[lane]);
        after[lane] = fma32(exp(y[lane]), energy, after[lane]);
      }
    }
  }
  const a = reduceFour(before);
  const b = reduceFour(after);
  if (a <= 1e-20) return 0;
  const divisor = fl(fl(fl(timestep + timestep) * blockLength) * blockFactor);
  return fl(-logf(fl(a / b)) / divisor);
}
