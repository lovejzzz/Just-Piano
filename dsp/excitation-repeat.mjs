import { fma32 } from './modal-kernel.mjs';
import { nextExcitationRandom } from './final-excitation.mjs';
import { compactScalarCurve } from './post-excitation.mjs';
import { nativeScalarExp } from './native-scalar-exp.mjs';
const fl = Math.fround;

// The first repeated-strike stage; later support-mode history is separate.
export function randomizeRepeatedExcitation({ amplitude, columns, baseRows, randomState, controls: c }) {
  if (![1, 2, 3].includes(columns) || !Number.isInteger(baseRows) || baseRows < 0 ||
      amplitude.length % columns || baseRows * columns > amplitude.length ||
      ![...amplitude, c.attenuation, c.scale].every(Number.isFinite) || c.attenuation < 0 ||
      ![0, 1].includes(c.repeatFlag)) throw new RangeError('Complete repeated-strike inputs required');
  const result = Array.from(amplitude, fl), state = [...randomState];
  let randomDraws = 0;
  if (c.repeatFlag === 1 && c.attenuation > 0) {
    const amount = fl(fl(c.attenuation) * fl(c.scale));
    if (amount >= 0.99) throw new RangeError('Repeated-strike variation must remain below native limit');
    for (let i = 0; i < baseRows * columns; i++) {
      const unit = fl(nextExcitationRandom(state) / 4294967296);
      const signed = fl(fl(unit + unit) - 1);
      result[i] = fl(result[i] * fma32(amount, signed, 1));
      randomDraws++;
    }
  }
  return { amplitude: result, randomState: state, randomDraws };
}

export function updateRepeatedSupportHistory({ amplitude, frequency, columns, baseRows, history, count,
  randomState, curve, controls: c }, { exp2f, log10f } = {}) {
  if (![1, 2, 3].includes(columns) || !Number.isInteger(count) || count < 1 || count > 16 ||
      amplitude.length !== frequency.length || amplitude.length < (baseRows + count) * columns ||
      history.length > 16 || ![...history, c.attenuation, c.randomScale, c.lower, c.upper, c.blend].every(Number.isFinite) ||
      !(c.upper > c.lower) || c.lower < 0 || typeof exp2f !== 'function' || typeof log10f !== 'function')
    throw new RangeError('Complete primary support-history inputs and platform math required');
  const state = [...randomState], values = Array.from({ length: count }, (_, i) => i < history.length ? fl(history[i]) : 1);
  const strength = Math.min(fl(fl(c.attenuation) * 3), 1);
  const lower = fma32(strength, fl(fl(c.lower) - 1), 1);
  const upper = fma32(fl(fl(c.upper) - 1), strength, 1);
  const amount = fl(strength * fl(c.randomScale));
  const exponents = [];
  for (let i = 0; i < count; i++) {
    const unit = fl(nextExcitationRandom(state) / 4294967296);
    let base = values[i], exponent;
    if (base <= lower) { base = lower; exponent = fl(amount * unit); }
    else if (base >= upper) { base = upper; exponent = fl(-amount * unit); }
    else exponent = fl(amount * fl(fl(unit + unit) - 1));
    exponents.push(exponent);
    values[i] = Math.min(upper, Math.max(lower, fl(base * fl(exp2f(exponent)))));
  }
  const decibels = x => x === 0 ? -1000 : fl(fl(log10f(fl(x))) * 20);
  const lowerDB = decibels(fl(c.lower)), upperDB = decibels(fl(c.upper));
  const db = values.map(decibels), lastDB = db.at(-1), result = Array.from(amplitude, fl), gains = [];
  const bits = new DataView(new ArrayBuffer(4)); bits.setUint32(0, 0x3debc8e3);
  const dbScale = bits.getFloat32(0);
  for (let i = 0; i < count; i++) {
    const blendDB = fma32(fl(c.blend), lastDB, fl(fl(1 - fl(c.blend)) * db[i]));
    const shape = compactScalarCurve(curve, fl(frequency[(baseRows + i) * columns]));
    const shapedDB = fma32(strength, shape, upperDB);
    const product = fl(fl(blendDB - lowerDB) * fl(shapedDB - lowerDB));
    const outputDB = fl(lowerDB + fl(product / fl(upperDB - lowerDB)));
    const gain = outputDB === 0 ? 1 : nativeScalarExp(fl(outputDB * dbScale));
    gains.push(gain);
    for (let column = 0; column < columns; column++) {
      const lane = (baseRows + i) * columns + column;
      result[lane] = fl(result[lane] * gain);
    }
  }
  return { amplitude: result, history: values, randomState: state, randomDraws: count, exponents, gains };
}
