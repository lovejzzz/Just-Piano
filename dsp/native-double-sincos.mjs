// arm64 libsystem_m __sincos_stret instruction order, including huge reduction.
// Mathematical constants only; no piano observations used as computed inputs.
import {fma64} from './modal-poles.mjs';
const view = new DataView(new ArrayBuffer(8));
const number = word => { view.setBigUint64(0, BigInt.asUintN(64, word)); return view.getFloat64(0); };
const bits = value => { view.setFloat64(0, value); return view.getBigUint64(0); };
const words = text => text.trim().split(/\s+/).map(x => BigInt('0x' + x));
const sine = words('3de5d8fd1fd19ccd be5ae5e5a9291f5d 3ec71de3567d48a1 bf2a01a019bfdf03 3f8111111110f7d0 bfc5555555555548').map(number);
const cosine = words('bda8fa49a0861a9b 3e21ee9d7b4e3f05 be927e4f7eac4bc6 3efa01a019c844f5 bf56c16c16c14f91 3fa555555555554b bfe0000000000000').map(number);
const reduction = words(`
35fdafd88fc6ae84 9e839cfbc5294975 ba93dd63f5f2f8bd a7a31fb34f2ff516
b69b3f6793e584db f79788c5ad05368f 8ffc4bffef02cc07 4e422fc5defc941d
9cc8eb1cc1a99cfa 74ce38135a2fbf20 74411afa975da242 7f0ef58e5894d39f
0324977504e8c90e db92371d2126e970 ff28b1d5ef5de2b0 6db14acc9e21c820
fe13abe8fa9a6ee0 517cc1b727220a94 0000000000000000`);
const sign = 0x8000000000000000n, mask = 0xffffffffffffffffn;
const u64 = x => x & mask, highProduct = (a, b) => (a * b) >> 64n;
const scale = number(0x3fe45f306dc9c883n);
const halfPi = [0x3ff921fb54440000n, 0x3d868c234c4c0000n, 0x3b298a2e03707345n].map(number);
const piFixed = 0xc90fdaa22168c235n;
function roundEven(x) {
  const low = Math.floor(x), fraction = x - low;
  return fraction < .5 ? low : fraction > .5 ? low + 1 : low % 2 ? low + 1 : low;
}
function polynomial(square, coefficients) {
  let result = coefficients[0];
  for (let i = 1; i < coefficients.length; i++) result = fma64(square, result, coefficients[i]);
  return result;
}
function sineTail(head, tail) {
  const r = head + tail;
  return fma64(r, (r * r) * polynomial(r * r, sine), tail) + head;
}
function cosineTail(head, tail) {
  const cross = head * tail;
  const square = fma64(head, head, cross + cross);
  return fma64(square, polynomial(square, cosine), 1);
}
const flip = (x, flag) => number(bits(x) ^ flag);
export function nativeDoubleSinCos(x) {
  if (typeof x !== 'number') throw new TypeError('Binary64 sincos input required');
  if (!Number.isFinite(x)) return {sin: NaN, cos: NaN};
  if (x === 0) return {sin: x, cos: 1};
  const magnitude = Math.abs(x);
  if (magnitude <= number(0x3fe921fb54442d18n))
    return {sin: sineTail(x, 0), cos: cosineTail(x, 0)};
  if (magnitude < number(0x412000013be57a40n)) {
    const n = roundEven(x * scale), nBits = BigInt.asUintN(64, BigInt(n));
    const a = n * halfPi[0], b = n * halfPi[1], c = n * halfPi[2];
    const first = x - a, head = first - b, tail = ((first - head) - b) - c;
    const sin = sineTail(head, tail), cos = cosineTail(head, tail);
    if (n % 2 === 0) {
      const flag = (nBits << 62n) & sign;
      return {sin: flip(sin, flag), cos: flip(cos, flag)};
    }
    const flag = ((nBits ^ (nBits >> 1n)) << 63n) & sign;
    return {sin: flip(cos, flag ^ sign), cos: flip(sin, flag)};
  }
  const raw = bits(x), exponent = Number((raw & ~sign) >> 52n) - 1023;
  const shift = exponent & 63, start = 15 - (exponent >> 6);
  const mantissa = u64((raw << 11n) | sign);
  let a, b, c;
  if (shift === 0) [a, b, c] = reduction.slice(start + 1, start + 4);
  else {
    const s = BigInt(shift), t = 64n - s;
    a = u64((reduction[start + 1] << s) | (reduction[start] >> t));
    b = u64((reduction[start + 2] << s) | (reduction[start + 1] >> t));
    c = u64((reduction[start + 3] << s) | (reduction[start + 2] >> t));
  }
  const sum = highProduct(a, mantissa) + u64(b * mantissa);
  let lower = u64(sum), upper = u64(highProduct(b, mantissa) + u64(c * mantissa) + (sum >> 64n));
  const sineFlag = ((raw & sign) ^ upper) & sign;
  const cosineFlag = (upper ^ (upper << 1n)) & sign;
  const swapped = Boolean(((upper << 2n) ^ (upper << 1n)) & sign);
  const complement = (upper << 2n) & sign ? mask : 0n;
  upper = (upper ^ complement) & 0x1fffffffffffffffn;
  lower ^= complement;
  const zeros = upper === 0n ? 64 : 64 - upper.toString(2).length;
  const normalized = u64((upper << BigInt(zeros & 63)) | (lower >> BigInt((64 - zeros) & 63)));
  const product = highProduct(piFixed, normalized), adjust = BigInt(zeros) << 52n;
  const r = number(bits(Number(product) / 2 ** 61) - adjust);
  const head = number(bits(Number(product & 0xffff000000000000n) / 2 ** 61) - adjust);
  const tail = number(bits(Number(product & 0xffffffffffffn) / 2 ** 61) - adjust);
  const sin = fma64(r, (r * r) * polynomial(r * r, sine), tail) + head;
  const square = number(bits(Number(highProduct(product, product)) / 2 ** 58) - 2n * adjust);
  const cos = fma64(square, polynomial(square, cosine), 1);
  return swapped ? {sin: flip(cos, sineFlag), cos: flip(sin, cosineFlag)}
    : {sin: flip(sin, sineFlag), cos: flip(cos, cosineFlag)};
}
