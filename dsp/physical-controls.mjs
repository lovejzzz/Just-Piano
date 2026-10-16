// Numerically recovered control arithmetic. Physical units and unobserved
// branches are intentionally not inferred from these coefficient names.
import { fma32 } from './modal-kernel.mjs';
const fl = Math.fround;
// Exact double bit pattern 0x3fbd791c5f888823 from the observed build.
const rateBits = new DataView(new ArrayBuffer(8));
rateBits.setUint32(0, 0x5f888823, true);
rateBits.setUint32(4, 0x3fbd791c, true);
const RATE_SCALE = rateBits.getFloat64(0, true);

export function releaseCoefficients({ x, u, cubicScale, polynomial, rateScale, gainScale, cubicGainScale }) {
  if (polynomial.length !== 5 ||
      ![x, u, cubicScale, rateScale, gainScale, cubicGainScale, ...polynomial].every(Number.isFinite)) {
    throw new TypeError('Finite control values and five polynomial coefficients required');
  }
  x = fl(x);
  u = fl(u);
  const h = fl(x * fl(x * x));
  const z = fl(h * fl(cubicScale));
  const r = Math.min(u, fl(1 - Math.max(0, Math.min(1, z))));
  const square = fl(r * r);
  const q = fl(square * square);
  const [c0, c1, c2, c3, c4] = polynomial.map(fl);
  const duration = fma32(q, fma32(q, fma32(q, fma32(c4, q, c3), c2), c1), c0);
  if (!(duration > 0)) throw new RangeError('Nonpositive duration is outside the validated active branch');
  return {
    duration,
    rate: fl(fl(rateScale) * RATE_SCALE / duration),
    gain: Math.max(fl(fl(1 - u) * fl(gainScale)), fl(h * fl(cubicGainScale))),
  };
}

// The normal u=0, mode=0 interpolation branch; this function deliberately
// rejects other modes. Endpoints clamp to the first/last value.
export function interpolateHardness({ knots, values, velocity, u = 0, mode = 0 }) {
  if (u !== 0 || mode !== 0) throw new RangeError('Unverified interpolation mode');
  if (knots.length !== 5 || values.length !== 5 ||
      ![velocity, ...knots, ...values].every(Number.isFinite)) {
    throw new TypeError('Five finite ordered knots and values required');
  }
  for (let i = 1; i < 5; i++) {
    if (!(knots[i] > knots[i - 1])) throw new RangeError('Knots must increase');
  }
  const v = fl(velocity);
  if (v <= fl(knots[0])) return fl(values[0]);
  if (v >= fl(knots[4])) return fl(values[4]);
  const i = knots.findIndex((k, index) => index < 4 && k <= v && v <= knots[index + 1]);
  if (i < 0) throw new RangeError('Extrapolation is outside the verified branch');
  const t = fl(fl(v - fl(knots[i])) / fl(fl(knots[i + 1]) - fl(knots[i])));
  return fma32(fl(1 - t), values[i], fl(t * fl(values[i + 1])));
}
