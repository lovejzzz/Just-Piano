// Instruction-order arm64 libsystem_m tan(double), including integer reduction.
// Mathematical constants only; no piano model or captured coefficient inputs.
import {fma64} from './modal-poles.mjs';
const view = new DataView(new ArrayBuffer(8));
const number = word => { view.setBigUint64(0, BigInt.asUintN(64, word)); return view.getFloat64(0); };
const bits = value => { view.setFloat64(0, value); return view.getBigUint64(0); };
const words = text => text.trim().split(/\s+/).map(x => BigInt('0x' + x));
const sine = words('3de5d8fd1fd19ccd be5ae5e5a9291f5d 3ec71de3567d48a1 bf2a01a019bfdf03 3f8111111110f7d0 bfc5555555555548').map(number);
const cosine = words('bda8fa49a0861a9b 3e21ee9d7b4e3f05 be927e4f7eac4bc6 3efa01a019c844f5 bf56c16c16c14f91 3fa555555555554b bfe0000000000000').map(number);
// Consecutive 64-bit limbs at tan-0x518 .. tan-0x488.
const reduction = words(`
35fdafd88fc6ae84 9e839cfbc5294975 ba93dd63f5f2f8bd a7a31fb34f2ff516
b69b3f6793e584db f79788c5ad05368f 8ffc4bffef02cc07 4e422fc5defc941d
9cc8eb1cc1a99cfa 74ce38135a2fbf20 74411afa975da242 7f0ef58e5894d39f
0324977504e8c90e db92371d2126e970 ff28b1d5ef5de2b0 6db14acc9e21c820
fe13abe8fa9a6ee0 517cc1b727220a94 0000000000000000`);
const sign = 0x8000000000000000n, mask = 0xffffffffffffffffn;
const u64 = x => x & mask;
const highProduct = (a, b) => (a * b) >> 64n;
const scale = number(0x3fe45f306dc9c883n);
const halfPi = [0x3ff921fb54440000n, 0x3d868c234c4c0000n, 0x3b298a2e03707345n].map(number);
function roundEven(x) {
  const low = Math.floor(x), fraction = x - low;
  return fraction < .5 ? low : fraction > .5 ? low + 1 : low % 2 ? low + 1 : low;
}
function polynomial(square, coefficients) {
  let result = coefficients[0];
  for (let i = 1; i < coefficients.length; i++) result = fma64(square, result, coefficients[i]);
  return result;
}
export function nativeDoubleTan(x) {
  if (typeof x !== 'number') throw new TypeError('Binary64 tangent input required');
  if (!Number.isFinite(x)) return NaN;
  if (x === 0) return x;
  const magnitude = Math.abs(x);
  let reduced = x, flip = 0n, reciprocal = false;
  if (magnitude >= number(0x3fe921fb54442d18n)) {
    if (magnitude < number(0x412000013be57a40n)) {
      const n = roundEven(x * scale);
      const a = n * halfPi[0], b = n * halfPi[1], c = n * halfPi[2];
      const first = x - a, head = first - b, tail = ((first - head) - b) - c;
      reduced = head + tail;
      reciprocal = Math.abs(n % 2) === 1;
      if (reciprocal) flip = sign;
    } else {
      const raw = bits(x), exponent = Number((raw & ~sign) >> 52n) - 1023;
      const shift = exponent & 63, start = 15 - (exponent >> 6);
      const mantissa = u64((raw << 11n) | sign);
      let a, b, c;
      if (shift === 0) {
        [a, b, c] = reduction.slice(start + 1, start + 4);
      } else {
        const s = BigInt(shift), t = 64n - s;
        a = u64((reduction[start + 1] << s) | (reduction[start] >> t));
        b = u64((reduction[start + 2] << s) | (reduction[start + 1] >> t));
        c = u64((reduction[start + 3] << s) | (reduction[start + 2] >> t));
      }
      const sum = highProduct(a, mantissa) + u64(b * mantissa);
      let lower = u64(sum), upper = u64(highProduct(b, mantissa) + u64(c * mantissa) + (sum >> 64n));
      flip = ((raw & sign) ^ (upper << 1n)) & sign;
      reciprocal = Boolean(((upper << 2n) ^ (upper << 1n)) & sign);
      const complement = (upper << 2n) & sign ? mask : 0n;
      upper = (upper ^ complement) & 0x1fffffffffffffffn;
      lower ^= complement;
      const zeros = upper === 0n ? 64 : 64 - upper.toString(2).length;
      const normalized = u64((upper << BigInt(zeros & 63)) | (lower >> BigInt((64 - zeros) & 63)));
      const product = highProduct(0xc90fdaa22168c235n, normalized);
      reduced = number(bits(Number(product) / 2 ** 61) - (BigInt(zeros) << 52n));
    }
  }
  const square = reduced * reduced;
  let sin = fma64(reduced, square * polynomial(square, sine), reduced);
  sin = number(bits(sin) ^ flip);
  const cos = fma64(square, polynomial(square, cosine), 1);
  return reciprocal ? cos / sin : sin / cos;
}
