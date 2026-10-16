// Ordinary 8-bit ARM FRECPE seed and one FRECPS/FMUL refinement. This narrow
// entry supports finite normal input with normal reciprocal seed, FPCR.AH=0.
// Integer seed rule cross-checked against ARM/QEMU and an independent hardware
// oracle; no platform calls are needed in the browser.
import { fma32 } from './modal-kernel.mjs';
const f = Math.fround, word = new DataView(new ArrayBuffer(4));
export function neonReciprocalEstimateNormal(value) {
  value = f(value);
  word.setFloat32(0, value);
  const bits = word.getUint32(0), exponent = (bits >>> 23) & 255;
  if (!Number.isFinite(value) || exponent < 1 || exponent > 252)
    throw new RangeError('Finite normal float with normal reciprocal seed required');
  const bucket = 256 + ((bits & 0x7fffff) >>> 15);
  const estimate = Math.floor((Math.floor(524288 / (2 * bucket + 1)) + 1) / 2);
  const resultBits = (bits & 0x80000000) | ((253 - exponent) << 23) | ((estimate & 255) << 15);
  word.setUint32(0, resultBits >>> 0);
  return word.getFloat32(0);
}

export function neonReciprocalNormal(value) {
  value = f(value);
  const estimate = neonReciprocalEstimateNormal(value);
  return f(estimate * fma32(-value, estimate, 2));
}
