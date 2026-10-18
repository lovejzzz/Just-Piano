// 8bd70c / 1c7d34..8184: finite ordinary control30 spectrum construction.
import {linearModelCurve} from './model-curves.mjs';
import {nativeDoubleSinCos} from './native-double-sincos.mjs';
const f = Math.fround, view = new DataView(new ArrayBuffer(4));
function word(bits) { view.setUint32(0, bits); return view.getFloat32(0); }
const MIN_POSITION = word(0x3a83126f), MIN_WIDTH = word(0x3c23d70a), MAX_WIDTH = word(0x3efae148);
function field(rows, offset) {
  const matches = rows?.filter(r => r.object_offset === offset);
  if (matches?.length !== 1) throw new Error('Unique control30 model field required');
  return matches[0].value;
}
function curve(rows, offset, note) {
  const value = field(rows, offset);
  if (value?.version !== 32771) throw new Error('Ordinary control30 curve required');
  const result = linearModelCurve(value, note, {runtimeMode: 'linear-clamp'});
  if (result.length !== 1 || !Number.isFinite(result[0])) throw new Error('Finite scalar control30 curve required');
  return result[0];
}
export function archiveExcitationControl30({baseFields, presetFields, note, rows}) {
  if (!Number.isInteger(note) || note < 1 || note > 127 || !Number.isInteger(rows) || rows < 0 || rows > 4096)
    throw new Error('Integer note and bounded independently produced row count required');
  const position = field(presetFields, 0x11c4);
  if (!Number.isFinite(position) || !Number.isFinite(f(position))) throw new Error('Finite preset position required');
  const rawCenter = Math.min(.5, Math.max(MIN_POSITION, f(f(position) * curve(presetFields, 0x11c8, note))));
  const widthInput = curve(baseFields, 0x830, note), strength = curve(baseFields, 0x880, note);
  const center = Math.min(.5, Math.max(MIN_WIDTH, rawCenter));
  const width = Math.min(Math.max(MIN_WIDTH, widthInput), Math.min(rawCenter, MAX_WIDTH));
  const scale = f(strength * Math.sqrt(f(center - width) / (.5 - width)));
  const left = Math.max(0, f(center - f(width * .5))), right = Math.min(1, f(center + f(width * .5)));
  const size = f(right - left), inverse = f(f(1 / size) * .5);
  const table = Array.from({length: rows}, (_, i) => {
    const harmonic = f(i + 1), omega = f(harmonic + harmonic) * Math.PI;
    const difference = nativeDoubleSinCos(omega * right).sin - nativeDoubleSinCos(omega * left).sin;
    const integral = f((size - difference / omega) * inverse), residual = f(1 - integral);
    const square = f(residual * residual);
    return f((f(square + square) - .5) * scale);
  });
  if (![rawCenter, widthInput, strength, scale, left, right, size, inverse, ...table].every(Number.isFinite))
    throw new Error('Finite control30 construction required');
  return {table, rawCenter, widthInput, strength, center, width, scale, left, right};
}
