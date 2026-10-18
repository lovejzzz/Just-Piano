import {fma32} from './modal-kernel.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
const f = Math.fround;
const view = new DataView(new ArrayBuffer(8));
view.setBigUint64(0, 0x40140d931ff62705n); const twiceRootTwoPi = view.getFloat64(0);
view.setBigUint64(0, 0x40040d931ff62705n); const rootTwoPi = view.getFloat64(0);

export function constructSoundboardExcitation({h, tau}, {amplitude, width}) {
  if (![h, tau, amplitude, width].every((v) => Number.isFinite(v) && Number.isFinite(f(v))) ||
      ![h, tau, amplitude].every((v) => f(v) > 0)) throw new RangeError('Positive finite excitation controls required');
  const interval = f(tau), spacing = f(h), span = Math.max(f(width), f(interval + interval));
  const half = Math.floor(f(f(span * 0.5) / interval) + 0.5), length = half * 2 + 1;
  if (length > 100000) throw new RangeError('Excitation outside supported bounds');
  const sigma = f(span / twiceRootTwoPi);
  const scale = f(1 / ((f(f(amplitude) * sigma) * rootTwoPi) * f(spacing * spacing)));
  const center = f(f(interval * f(length - 1)) * 0.5), vectorEnd = Math.trunc(length / 4) * 4;
  const gaussian = new Float32Array(length + 1);
  let norm = 0;
  for (let i = 0; i < length; i++) {
    const difference = i < vectorEnd ? f(f(f(i) * interval) - center) : fma32(-interval, f(i), center);
    const x = f(difference / sigma), exponent = f(f(x * x) * -0.5);
    gaussian[i] = f(nativeScalarExp(exponent) * scale);
    norm = i < vectorEnd ? f(norm + f(gaussian[i] * gaussian[i])) : fma32(gaussian[i], gaussian[i], norm);
  }
  if (!Number.isFinite(f(Math.sqrt(norm)))) throw new RangeError('Non-finite excitation norm');
  const inverseInterval = f(1 / interval), output = new Float32Array(length + 1);
  let previous = 0;
  for (let i = 0; i < output.length; i++) {
    output[i] = f(f(gaussian[i] - previous) * inverseInterval); previous = gaussian[i];
  }
  if (output.some((v) => !Number.isFinite(v))) throw new RangeError('Non-finite excitation');
  return {output, gaussian, sigma, scale};
}
