// Exact binary64 fused multiply-add used by recovered coefficient arithmetic.
const bits = new DataView(new ArrayBuffer(8));
function split(value) {
  bits.setFloat64(0, value);
  const word = bits.getBigUint64(0);
  const exponent = Number((word >> 52n) & 2047n);
  let mantissa = word & ((1n << 52n) - 1n);
  if (exponent) mantissa |= 1n << 52n;
  if (word >> 63n) mantissa = -mantissa;
  return [mantissa, exponent ? exponent - 1075 : -1074];
}
// Exact integer product and addition, followed by one binary64 ties-even round.
// Used during coefficient/table construction, never per audio sample.
export function fma64(a, b, c) {
  if ([a, b, c].some(Number.isNaN)) return NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a * b + c;
  // A finite exact product plus infinity stays infinity, even if separately
  // evaluating a*b would overflow to the opposite infinity.
  if (!Number.isFinite(c)) return c;
  const [am, ae] = split(a), [bm, be] = split(b), [cm, ce] = split(c);
  const pe = ae + be, exponent = Math.min(pe, ce);
  let integer = (am * bm << BigInt(pe - exponent)) + (cm << BigInt(ce - exponent));
  if (integer === 0n) {
    // Exact cancellation rounds to +0 in round-to-nearest mode. The exception
    // is an exact zero product plus zero with both terms carrying a minus sign.
    const negativeProduct = (a < 0 || Object.is(a, -0)) !== (b < 0 || Object.is(b, -0));
    return (a === 0 || b === 0) && c === 0 && negativeProduct && Object.is(c, -0) ? -0 : 0;
  }
  const sign = integer < 0n ? -1 : 1;
  if (integer < 0n) integer = -integer;
  const shift = Math.max(0, integer.toString(2).length - 53, -1074 - exponent);
  if (shift) {
    const count = BigInt(shift), mask = (1n << count) - 1n;
    const tail = integer & mask, midpoint = 1n << (count - 1n);
    integer >>= count;
    if (tail > midpoint || (tail === midpoint && (integer & 1n))) integer++;
  }
  return sign * Number(integer) * 2 ** (exponent + shift);
}
