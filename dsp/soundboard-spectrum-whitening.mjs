import {fma32} from './modal-kernel.mjs';
import {nativeScalarPowf} from './native-scalar-pow.mjs';
import {nativeDoubleSinCos} from './native-double-sincos.mjs';
import {smoothSoundboardSpectrum} from './soundboard-spectrum-smoothing.mjs';
const f = Math.fround;

export function whitenSoundboardSpectrum(input, {amount, width, binSpacing, flags}) {
  if (!(input instanceof Float32Array) || !input.length || input.some((v) => !Number.isFinite(v) || v < 0) ||
      ![amount, width, binSpacing].every((v) => Number.isFinite(v) && Number.isFinite(f(v))) ||
      !(f(width) > 0) || f(width) > 3000 || !(f(binSpacing) > 0) ||
      !Number.isInteger(flags) || flags < 0 || flags > 0xffffffff) {
    throw new RangeError('Finite magnitude spectrum and supported whitening controls required');
  }
  const a = f(amount), w = f(width), step = f(binSpacing);
  let peak = 0;
  for (const value of input) peak = Math.max(peak, value);
  if (!(peak > 0)) throw new RangeError('Nonzero magnitude spectrum required');
  const floor = f(peak * f(0.001));
  const offset = Float32Array.from(input, (value) => f(value + floor));
  let output = smoothSoundboardSpectrum(offset, f(step / w)).output;
  const lower = Math.trunc(f(f(Math.ceil(f(3000 - w))) / step));
  const upper = Math.trunc(f(f(3000 + w) / step));
  if (lower < 0 || upper > output.length || upper <= lower) throw new RangeError('Whitening band outside spectrum');
  let sum = 0;
  for (let i = lower; i < upper; i++) sum = f(sum + Math.abs(output[i]));
  const mean = f(sum / f(upper - lower));
  if (!(mean > 0)) throw new RangeError('Positive whitening band mean required');
  for (let i = 0; i < output.length; i++) {
    const frequency = f(step * f(i));
    let weight = 1;
    if (frequency > 1000) {
      weight = frequency > 3000 ? 0 : f((nativeDoubleSinCos((f(frequency - 1000) * Math.PI) / 2000).cos + 1) * 0.5);
    }
    const ratio = f(output[i] / mean);
    const powered = nativeScalarPowf(ratio, fma32(weight, a, -1));
    output[i] = flags & 1 ? powered : Math.max(f(1 / ratio), powered);
  }
  if (!(flags & 1)) output = smoothSoundboardSpectrum(output, f(0.05)).output;
  if (output.some((v) => !Number.isFinite(v))) throw new RangeError('Non-finite whitened spectrum');
  return {output, peak, floor, lower, upper, mean};
}
