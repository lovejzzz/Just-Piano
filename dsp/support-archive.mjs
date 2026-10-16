import { linearModelCurve } from './model-curves.mjs';
import { compactScalarCurve } from './post-excitation.mjs';
import { nativeScalarLogf } from './native-scalar-log.mjs';
import { fma32 } from './modal-kernel.mjs';
const fl = Math.fround;
const word = new DataView(new ArrayBuffer(4)); word.setUint32(0, 0x3debc8e3);
const DB_SCALE = word.getFloat32(0);

export function archiveSupportInputs(bank, note, { runtimeMode } = {}) {
  const fields = new Map(bank.fields.map(r => [r.object_offset, r.value]));
  const curve = offset => {
    const value = fields.get(offset);
    if (!value?.y?.length || !Array.isArray(value.x)) throw new RangeError('Complete support model curves required');
    return value;
  };
  const evaluate = offset => linearModelCurve(curve(offset), note, { runtimeMode });
  const first = { frequencies: evaluate(0x1190), lowDB: evaluate(0x11e0), highDB: evaluate(0x1230), decay: evaluate(0x1280) };
  const secondCurve = curve(0x1320), n = fl(note), epsilon = fl(1e-5);
  const secondEnabled = secondCurve.x.length > 0 && n >= fl(fl(secondCurve.x[0]) - epsilon) && n <= fl(fl(secondCurve.x.at(-1)) + epsilon);
  const second = { frequencies: secondEnabled ? evaluate(0x1320) : [], lowDB: secondEnabled ? evaluate(0x1370) : [],
    highDB: secondEnabled ? evaluate(0x13c0) : [], decay: evaluate(0x1410) };
  for (const group of [first, second]) if (group.lowDB.length !== group.frequencies.length || group.highDB.length !== group.frequencies.length ||
      group.decay.length < group.frequencies.length) throw new RangeError('Support vector dimensions differ');
  return { first, second, secondEnabled };
}

export function correctSupportFrequencyDB({ frequencies, inputDB, controls: c, baseCurve, editCurve }) {
  if (frequencies.length !== inputDB.length || ![c.referenceFrequency, c.blend, ...frequencies, ...inputDB].every(Number.isFinite))
    throw new RangeError('Complete support frequency correction inputs required');
  const evaluate = (curve, x) => {
    if (curve.dimension !== 1 || curve.log_x !== 0 || curve.special_mode !== 0) throw new RangeError('Unverified support correction curve mode');
    return linearModelCurve(curve, x, { runtimeMode: 'linear-clamp' })[0];
  };
  return frequencies.map((value, i) => {
    const frequency = fl(fl(c.referenceFrequency) * fl(value));
    if (!(frequency > 0.001)) return fl(inputDB[i]);
    const coordinate = nativeScalarLogf(frequency);
    const edit = c.editFlag & 1 ? evaluate(editCurve, coordinate) : 0;
    const correction = fma32(fl(1 - fl(c.blend)), evaluate(baseCurve, coordinate), edit);
    return fl(fl(inputDB[i]) + correction);
  });
}

export function normalizeSupportDB({ frequencies, lowDB, highDB, matrix, correction, referenceAmplitude }, { log10f } = {}) {
  if (lowDB.length !== frequencies.length || highDB.length !== frequencies.length ||
      matrix.values.length !== matrix.rows * matrix.cols || !Number.isInteger(matrix.rows) || matrix.rows < 0 ||
      !Number.isInteger(matrix.cols) || matrix.cols < 1 || !(referenceAmplitude >= 0) ||
      ![referenceAmplitude, ...frequencies, ...lowDB, ...highDB, ...matrix.values, ...correction].every(Number.isFinite) ||
      typeof log10f !== 'function') throw new RangeError('Complete normalization inputs and explicit log10f required');
  const low = lowDB.map(fl), high = highDB.map(fl);
  if (!matrix.rows || !frequencies.length) return { lowDB: low, highDB: high };
  const count = Math.min(matrix.rows, correction.length + 1);
  const x = Array.from({ length: count }, (_, i) => fl(matrix.values[i * matrix.cols]));
  const y = Array.from({ length: count }, (_, i) => i < correction.length ? fl(correction[i]) : 0);
  const curve = { x, y, dimension: 1, log_x: 0, special_mode: 0 };
  const referenceDB = referenceAmplitude === 0 ? -1000 : fl(fl(log10f(fl(referenceAmplitude))) * 20);
  for (let i = 0; i < frequencies.length; i++) {
    const input = fl(Math.max(fl(frequencies[i]), 1) * x[0]);
    let value;
    // Native compact boundary mode 0 returns zero outside a multi-node curve.
    if (input < x[0] || (x.length > 1 && input > x.at(-1))) value = 0;
    else value = compactScalarCurve(curve, input);
    const difference = fl(value - referenceDB);
    low[i] = fl(difference + low[i]); high[i] = fl(difference + high[i]);
  }
  return { lowDB: low, highDB: high };
}

export const supportDBToLog = values => values.map(value => fl(fl(value) * DB_SCALE));
