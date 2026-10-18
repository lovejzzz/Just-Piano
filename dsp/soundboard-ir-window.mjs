// FUN_10002fe20: soundboard IR cache weighting window.
import {fma32} from './modal-kernel.mjs';

const f = Math.fround;

export function soundboardIrWeights(length) {
  if (!Number.isInteger(length) || length < 5) {
    throw new RangeError('Integer soundboard length >= 5 required');
  }
  const result = new Float32Array(length);
  result.fill(1);
  const taper = Math.floor(length / 5);
  const start = length - taper - 1;
  for (let index = 0; index <= taper; index++) {
    const x = f(index / taper);
    const x2 = f(x * x);
    const sixth = f(x2 * 6);
    const x4six = f(x2 * sixth);
    let combined = f(x2 * -15);
    combined = f(x2 * combined);
    combined = fma32(x, x4six, combined);
    const tenX2 = f(x2 * 10);
    combined = fma32(x, tenX2, combined);
    result[start + index] = f(1 - combined);
  }
  return result;
}
