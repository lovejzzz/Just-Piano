// macOS ARM64 atan2f: quadrant selection and factored double polynomial.
// Preserve the native small-angle negative-X constant, which differs from pi.
// NaN payloads and floating exception flags are not modeled.
import {fma64} from './modal-poles.mjs';
const f = Math.fround, word = new DataView(new ArrayBuffer(8));
const from64 = x => {word.setBigUint64(0, BigInt('0x'+x)); return word.getFloat64(0);};
const C = `4002609372076e2c c00792d5bf17c0bc 40038f4c070b63c1 4015e43168d7c2b6
3f953db49b9fcf6b c013e370146726b3 400e4fa479729042 401ae0fb08f2dc00 3f680bc0fe23203d`.split(/\s+/).map(from64);
const SMALL_PI = from64('400921fb40080000');
function polynomial(r) {
  const z = r*r;
  const a = fma64(z, z+C[0], C[2]), b = fma64(z, z+C[1], C[3]);
  const c = fma64(z, z+C[4], C[6]), d = fma64(z, z+C[5], C[7]);
  const first = (a*c)*C[8], second = (b*d)*r;
  return first*second;
}
export function nativeScalarAtan2f(y, x) {
  y=f(y); x=f(x);
  if (Number.isNaN(y) || Number.isNaN(x)) return f(y+x);
  if (y < x) {
    if (-x >= y) return f(-x === y ? -Math.PI/4 : -Math.PI/2-polynomial(x/y));
    return f(polynomial(y/x));
  }
  if (y === x) {
    if (y < 0) return f(-3*Math.PI/4);
    if (y > 0) return f(Math.PI/4);
    if (!Object.is(x,-0)) return y;
    return f(Object.is(y,-0) ? -SMALL_PI : SMALL_PI);
  }
  if (-x >= y) {
    if (-x === y) return f(3*Math.PI/4);
    const r = y/x, negative = y < 0 || Object.is(y,-0);
    if (Math.abs(r) < 2**-22) return f(negative ? -SMALL_PI : SMALL_PI);
    return f(polynomial(r) + (negative ? -Math.PI : Math.PI));
  }
  return f(Math.PI/2-polynomial(x/y));
}
