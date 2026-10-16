// Instruction-order reconstruction of this host's libsystem_m _simd_exp_f4,
// reached by Accelerate vexpf. Not Pianoteq's distinct custom eight-lane exp.
import { fma32 } from './modal-kernel.mjs';
const f32 = Math.fround;
const word = new DataView(new ArrayBuffer(4));
function fromBits(bits) { word.setUint32(0, bits); return word.getFloat32(0); }
const LOW = fromBits(0xc2cff1b5), HIGH = fromBits(0x42b17218);
const LOG2E = fromBits(0x3fb8aa3b);
const LN2_HI_NEG = fromBits(0xbf318000), LN2_LO = fromBits(0x395e8083);
const COEFFICIENTS = [0x3aea6bc0, 0x3c045bfb, 0x3d2aee9a, 0x3e2aa92b, 0x3f000001].map(fromBits);

export function nativeVectorExpLane(value) {
  value = Math.max(LOW, f32(value));
  value = Math.min(HIGH, value);
  if (Number.isNaN(value)) return NaN;
  const exponent = Math.floor(f32(value * LOG2E));
  let reduced = fma32(LN2_HI_NEG, exponent, value);
  reduced = fma32(LN2_LO, exponent, reduced);
  let polynomial = fma32(COEFFICIENTS[0], reduced, COEFFICIENTS[1]);
  polynomial = fma32(polynomial, reduced, COEFFICIENTS[2]);
  polynomial = fma32(polynomial, reduced, COEFFICIENTS[3]);
  polynomial = fma32(polynomial, reduced, COEFFICIENTS[4]);
  polynomial = fma32(polynomial, reduced, 1);
  polynomial = fma32(reduced, polynomial, 1);
  const subnormal = exponent + 127 <= 0;
  const scale = fromBits((exponent + (subnormal ? 254 : 127)) << 23);
  const result = f32(polynomial * scale);
  return subnormal ? f32(result * fromBits(0x00400000)) : result;
}
export function nativeVectorExp4(values) {
  if (values.length !== 4) throw new RangeError('vexpf expects four float lanes');
  return Float32Array.from(values, nativeVectorExpLane);
}
