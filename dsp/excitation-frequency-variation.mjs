// 71644c..71653c and 716638..71673c. Padded four-lane draws matter.
import {fma32} from './modal-kernel.mjs';
import {linearModelCurve} from './model-curves.mjs';
import {nextExcitationRandom} from './final-excitation.mjs';
const f = Math.fround;
const word = new DataView(new ArrayBuffer(4));
word.setUint32(0, 0x3b83126f);
const SPREAD_SCALE = word.getFloat32(0);

function stateWords(state) {
  if (!Array.isArray(state) || state.length !== 4 || !state.every(x => Number.isInteger(x) && x >= 0 && x <= 0xffffffff))
    throw new RangeError('Four unsigned RNG words required');
}

// Invert the bijective update, never infer a seed from target frequencies.
export function rewindExcitationRandom(state, draws) {
  stateWords(state);
  if (!Number.isInteger(draws) || draws < 0 || draws > 1048576) throw new RangeError('Bounded integer draw count required');
  let current = [...state];
  for (let i = 0; i < draws; i++) {
    const y = (current[3] ^ current[2] ^ (current[2] >>> 19)) >>> 0;
    const t = (y ^ (y >>> 8) ^ (y >>> 16) ^ (y >>> 24)) >>> 0;
    const oldX = (t ^ (t << 11) ^ (t << 22)) >>> 0;
    current = [oldX, current[0], current[1], current[2]];
  }
  return current;
}

export function secondaryFrequencySeed(noteIndex) {
  if (!Number.isInteger(noteIndex) || noteIndex < 0 || noteIndex > 0xffffffff) throw new RangeError('Unsigned native note index required');
  const state = [noteIndex];
  for (let i = 1; i < 4; i++) state.push((Math.imul(state[i - 1], 1103515245) + 12345) >>> 0);
  return state;
}

export function archiveFrequencyVariationControls(bank, note, {instrumentMode, runtimeCurveMode} = {}) {
  if (instrumentMode !== 1) throw new RangeError('Only explicitly selected instrument mode one is implemented');
  const a = bank.fields?.find(row => row.object_offset === 0x2548)?.value;
  const b = bank.fields?.find(row => row.object_offset === 0x2a38)?.value;
  if (a?.version !== 14 || b?.version !== 10 || b.integer14c !== 2)
    throw new RangeError('Verified source compounds and two-source mode required');
  const scalar = curve => {
    const values = linearModelCurve(curve, note, {runtimeMode: runtimeCurveMode});
    if (values.length !== 1) throw new RangeError('Scalar frequency variation curve required');
    return values[0];
  };
  return {primarySpread: scalar(a.curves[4]), secondarySpread: scalar(b.curve158), secondaryOffset: scalar(b.curve1a8)};
}

export function varyExcitationFrequencies({frequency, columns, spread, offset, randomState}) {
  stateWords(randomState);
  if (!Number.isInteger(columns) || columns < 1 || columns > 3 || !frequency?.length || frequency.length % columns ||
      ![...frequency, spread, offset].every(Number.isFinite) || !frequency.every(x => x > 0))
    throw new RangeError('Complete positive modal rows and finite variation controls required');
  const result = Float32Array.from(frequency), state = [...randomState];
  const gain = f(f(spread) * SPREAD_SCALE), additive = f(f(offset) + f(offset));
  const randomDraws = spread === 0 && offset === 0 ? 0 : Math.ceil(result.length / 4) * 4;
  for (let i = 0; i < randomDraws; i++) {
    const centered = fma32(f(nextExcitationRandom(state)), 2 ** -32, -0.5);
    if (i < result.length) result[i] = fma32(centered, additive, f(result[i] * fma32(centered, gain, 1)));
  }
  // 7169d8..716a24 checks only each row's first column; it does not sort.
  let spacingCorrections = 0;
  for (let i = columns; i < result.length; i += columns) {
    const minimum = f(result[i - columns] + f(0.1));
    if (minimum > result[i]) {result[i] = minimum; spacingCorrections++;}
  }
  return {frequency: result, randomState: state, randomDraws, spacingCorrections};
}
