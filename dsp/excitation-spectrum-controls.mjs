import { fma32 } from './modal-kernel.mjs';
import { nativeScalarExp } from './native-scalar-exp.mjs';
const fl = Math.fround;
const word = new DataView(new ArrayBuffer(4));
const floatWord = x => { word.setUint32(0, x); return word.getFloat32(0); };
const EPSILON = floatWord(0x3c23d700);
const LOWER_U_SCALE = floatWord(0x3debc8e3);
const CUBE_ROOT = floatWord(0x3eaaaaab);

export function excitationSpectrumControls({ primary, secondary, referenceFrequency }, c, { powf, pow } = {}) {
  if (![primary, secondary, referenceFrequency, c.scale, c.slopeBlend, c.referenceBlend,
    c.u, c.lowerBase, c.lowerControl, c.lowerScale, c.lowerUSupport, ...c.referenceTable].every(Number.isFinite) ||
    c.referenceTable.length !== 3 || !(referenceFrequency > 0) || c.scale === 0 || ![0, 1].includes(c.repeatFlag))
    throw new TypeError('Complete finite spectrum controls required');
  const transform = x => fl(fl(1 - fl(fl(1.01) / fl(fl(x) + EPSILON))) * fl(c.scale));
  const rawSlope = transform(primary), secondarySlope = transform(secondary);
  let slope = rawSlope;
  if (c.slopeBlend !== 0) {
    slope = 0;
    if (c.slopeBlend !== 1) {
      if (typeof powf !== 'function' || typeof pow !== 'function') throw new RangeError('Explicit platform power functions required');
      const root = fl(powf(Math.abs(rawSlope), CUBE_ROOT));
      const signed = rawSlope < 0 ? -root : root;
      const mixed = fma32(fl(c.slopeBlend), 0, fl(fl(1 - fl(c.slopeBlend)) * signed));
      slope = fl(pow(mixed, 3));
    }
  }
  const referenceNumerator = slope > 0 ? fl(c.referenceTable[2]) : c.repeatFlag & 1 ? fl(c.referenceTable[1]) :
    fma32(fl(c.referenceBlend), fl(c.referenceTable[1]), fl(fl(1 - fl(c.referenceBlend)) * fl(c.referenceTable[0])));
  const baseScale = slope <= 0 ? fl(1 - fl(primary)) : fl(slope / fl(c.scale));
  const lower = slope > 0 ? 0 : fma32(fl(fl(fl(c.u) + fl(c.u)) * fl(c.lowerUSupport)), LOWER_U_SCALE,
    fma32(fl(c.lowerControl), fl(c.lowerScale), fl(c.lowerBase)));
  return { slope, secondarySlope, referenceNumerator, baseScale, lower,
    reference: fl(referenceNumerator / fl(referenceFrequency)) };
}

// Extra spectrum contributions before fractional modal-coordinate resampling.
export function excitationExtraTable({ count, tables, controls: c }, { historyGain } = {}) {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(c.direction) ||
      ![c.floor, c.blend, c.u, c.history, c.control30].every(Number.isFinite))
    throw new TypeError('Complete extra spectrum controls required');
  if (c.history !== 0 && !Number.isFinite(historyGain)) throw new RangeError('Unrecovered history gain curve requires explicit value');
  const result = new Float32Array(count);
  const read = (key, index) => index < tables[key].length ? fl(tables[key][index]) : undefined;
  for (let i = 0; i < count; i++) {
    let value = 0, v = read('floor', i);
    if (c.floor !== 0 && v !== undefined) value = fma32(fl(c.floor), v, 0);
    v = read('blend', i);
    if (v !== undefined) value = fma32(fl(c.blend), v, value);
    v = read('u', i);
    if (c.u !== 0 && v !== undefined) value = fma32(fl(fl(c.u) + fl(c.u)), v, value);
    v = read('history', i);
    if (c.history !== 0 && v !== undefined) value = fma32(fl(fl(c.history) * fl(historyGain)), v, value);
    v = read('control30', i);
    if (c.control30 !== 0 && v !== undefined) value = fma32(fl(c.control30), v, value);
    if (c.direction !== 0) {
      v = read(c.direction > 0 ? 'positive' : 'negative', i);
      if (v !== undefined) value = fl(value + v);
    }
    result[i] = value;
  }
  return result;
}

export function prepareExcitationWeightSource({ header, source }, c) {
  const [columns, rows] = header;
  if (![1, 2, 3].includes(columns) || c.columns !== columns || c.rowsToModify !== rows ||
      Object.values(source).some(a => a.length !== rows * columns) ||
      !['amplitudeFloor', 'amplitudeBlend', 'phaseFloor', 'phaseBlend', 'floor', 'blend', 'mix', 'decayInput', 'decayScale'].every(k => Number.isFinite(c[k])))
    throw new RangeError('Complete source and neighbor controls required');
  const result = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Float32Array.from(value)]));
  let amplitudeGain, phaseDelta;
  if (columns >= 3) {
    amplitudeGain = nativeScalarExp(fma32(fl(c.blend), fl(c.amplitudeBlend), fl(fl(c.amplitudeFloor) * fl(c.floor))));
    const phase = fma32(fl(c.blend), fl(c.phaseBlend), fl(fl(c.phaseFloor) * fl(c.floor)));
    const angle = fl(phase + floatWord(0x40490fdb)), tau = floatWord(0x40c90fdb);
    const turns = fl(Math.floor(fl(angle / tau)));
    phaseDelta = fl(fma32(-turns, tau, angle) - Math.PI);
    const complement = fl(1 - fl(c.mix));
    for (let row = 0; row < rows; row++) {
      const i = row * columns + 2;
      result.amplitude[i] = fma32(fl(c.mix), fl(amplitudeGain * result.amplitude[i - 1]), fl(complement * result.amplitude[i]));
      result.phase[i] = fma32(fl(c.mix), fl(result.phase[i - 1] + phaseDelta), fl(complement * result.phase[i]));
    }
  }
  const decayGain = fl(fl(c.decayInput) * fl(c.decayScale));
  result.decay = Float32Array.from(result.decay, d => fl(d * decayGain));
  return { header, source: result, amplitudeGain, phaseDelta, decayGain };
}
