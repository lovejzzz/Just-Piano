// 1001d0364 arm64 four-lane modal sine/cosine approximation. This reproduces
// the shipped polynomial and range reduction, not the mathematical functions.
import { fma32 } from './modal-kernel.mjs';
const f = Math.fround;
const view = new DataView(new ArrayBuffer(4));
const fromBits = bits => { view.setUint32(0, bits); return view.getFloat32(0); };
const C = Object.freeze({
  scale: fromBits(0x3fa2f983),
  reduce1: fromBits(0xbf490000), reduce2: fromBits(0xb97da000), reduce3: fromBits(0xb3222169),
  cosineHigh: fromBits(0x37ccf5ce), sineHigh: fromBits(0xb94ca1f9),
  cosineMiddle: fromBits(0xbab6061a), sineMiddle: fromBits(0x3c08839e),
  cosineLow: fromBits(0x3d2aaaa5), sineLow: fromBits(0xbe2aaaa3),
});

// FCVTZU on a scalar lane: saturating uint32, truncation toward zero.
function unsignedTruncate(value) {
  if (Number.isNaN(value) || value <= 0) return 0;
  if (value >= 0xffffffff) return 0xffffffff;
  return Math.trunc(value);
}

export function nativeModalTrigLane(angle) {
  angle = f(angle);
  if (!Number.isFinite(angle)) throw new RangeError('Finite float modal angle required');
  // 1d0368 uses a numeric negative comparison, not the IEEE sign bit. Thus
  // negative zero produces positive sine zero, as in the target instruction.
  const negative = angle < 0;
  const integer = unsignedTruncate(f(Math.abs(angle) * C.scale));
  const quadrant = ((((integer + 1) >>> 0) & 0xfffffffe) >>> 0);
  const reducedIndex = f(quadrant);
  let reduced = fma32(reducedIndex, C.reduce1, Math.abs(angle));
  reduced = fma32(reducedIndex, C.reduce2, reduced);
  reduced = fma32(reducedIndex, C.reduce3, reduced);
  const squared = f(reduced * reduced);
  // 1d0414/424/440/444: each polynomial stage is float FMA.
  const cosineMiddle = fma32(squared, C.cosineHigh, C.cosineMiddle);
  const sineMiddle = fma32(squared, C.sineHigh, C.sineMiddle);
  const cosineLow = fma32(squared, cosineMiddle, C.cosineLow);
  const sineLow = fma32(squared, sineMiddle, C.sineLow);
  const cosinePower = f(squared * cosineLow);
  const sinePower = f(squared * sineLow);
  let cosinePolynomial = f(squared * -0.5);
  cosinePolynomial = fma32(squared, cosinePower, cosinePolynomial);
  const sinePolynomial = fma32(reduced, sinePower, reduced);
  cosinePolynomial = f(cosinePolynomial + 1);
  const useSinePolynomial = (quadrant & 2) === 0;
  const selectedSine = useSinePolynomial ? sinePolynomial : cosinePolynomial;
  const selectedCosine = useSinePolynomial ? cosinePolynomial : sinePolynomial;
  const positiveSine = ((quadrant & 4) === 0) !== negative;
  const negativeCosine = ((((integer - 1) >>> 0) & 4) === 0);
  return { sin: positiveSine ? selectedSine : -selectedSine,
    cos: negativeCosine ? -selectedCosine : selectedCosine,
    integer, quadrant, reduced };
}

export function nativeModalTrig(angles) {
  if (angles?.length !== 4) throw new RangeError('Exactly four modal angles required');
  const sin = new Float32Array(4), cos = new Float32Array(4);
  for (let lane = 0; lane < 4; lane++) {
    const result = nativeModalTrigLane(angles[lane]);
    sin[lane] = result.sin; cos[lane] = result.cos;
  }
  return { sin, cos };
}
