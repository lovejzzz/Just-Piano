// Real N=32768 setup: four lanes, scalar core 8192 = 2 * 4^6.
// Only read twiddle positions are marked; allocation padding is not modeled.
import {nativeScalarSinCos} from './native-scalar-sincos.mjs';
const f = Math.fround;

export function buildReal32768Coefficients() {
  const coreLength = 8192;
  const twiddle = new Float32Array(coreLength);
  const usedTwiddle = new Uint8Array(coreLength);
  const e = new Float32Array(24576);
  const unit = f(2 * Math.PI / coreLength);
  let l1 = 1, offset = 0;
  for (const radix of [2, 4, 4, 4, 4, 4, 4]) {
    const ido = coreLength / (l1 * radix);
    for (let j = 1; j < radix; j++) {
      const base = f(j * l1 * unit);
      for (let i = 1; i < Math.floor((ido + 1) / 2); i++) {
        const pair = nativeScalarSinCos(f(i * base));
        const index = offset + 2 * (i - 1);
        twiddle[index] = pair.cos; twiddle[index + 1] = pair.sin;
        usedTwiddle[index] = usedTwiddle[index + 1] = 1;
      }
      offset += ido;
    }
    l1 *= radix;
  }
  const finalUnit = f(-2 * Math.PI / 32768);
  for (let block = 0; block < 1024; block++) {
    for (let j = 1; j < 4; j++) {
      const base = f(finalUnit * j), index = block * 24 + (j - 1) * 8;
      for (let lane = 0; lane < 4; lane++) {
        const pair = nativeScalarSinCos(f(base * (block * 4 + lane)));
        e[index + lane] = pair.cos; e[index + 4 + lane] = pair.sin;
      }
    }
  }
  return {twiddle, usedTwiddle, e};
}
