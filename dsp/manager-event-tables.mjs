// 77d790: interface caches, before 6d5308 copies them to host configuration.
// Runtime curve modes and global-selection flag must be supplied, not inferred
// from archive compression flags. No raw-MIDI normalization is established here.
import {linearModelCurve} from './model-curves.mjs';
import {fma32} from './modal-kernel.mjs';
const f = Math.fround;

export function buildManagerEventTables({base, preset, useGlobal, global, runtimeMode} = {}) {
  if (typeof useGlobal !== 'boolean' || !Number.isFinite(preset?.pedalInvert) ||
      runtimeMode !== 'linear-clamp')
    throw new RangeError('Explicit global branch, finite pedal inversion and runtime curve mode required');
  const evaluate = (curve, input) => {
    const result = linearModelCurve(curve, input, {runtimeMode});
    if (result.length !== 1 || !Number.isFinite(result[0])) throw new RangeError('Finite scalar curve required');
    return result[0];
  };
  const choose = (key) => {
    if (!useGlobal) return preset[key];
    if (!Array.isArray(global?.[key]?.y)) throw new RangeError('Explicit global curve required');
    return global[key].y.length ? global[key] : preset[key];
  };
  const on = choose('noteOn'), off = choose('noteOff'), pedal = choose('pedal');
  const tables = {noteOn: [], noteOff: [], pedal: [], pitch: []};
  for (let i = 0; i < 128; i++) {
    const x = f(i / 127);
    tables.noteOn.push(evaluate(on, evaluate(base?.noteOn, x)));
    tables.noteOff.push(evaluate(off, x));
    const v = evaluate(base?.pedal, evaluate(pedal, x));
    tables.pedal.push(fma32(f(f(1 - v) - v), f(preset.pedalInvert), v));
    tables.pitch.push(evaluate(preset.pitch, x));
  }
  for (const key of ['noteOn', 'noteOff']) {
    const t = tables[key];
    t.push(Math.min(1, f(f(t[127] + t[127]) - t[126])));
  }
  for (const key of ['pedal', 'pitch']) tables[key].push(tables[key][127]);
  return tables;
}

export function managerEventCurvesFromArchive({baseFields, presetFields}) {
  const fields = (rows) => {
    if (!Array.isArray(rows)) throw new TypeError('Decoded archive fields required');
    return new Map(rows.map(row => [row.object_offset, row.value]));
  };
  const b = fields(baseFields), a = fields(presetFields);
  return {
    base: {noteOn: b.get(0x6d8), pedal: b.get(0x728)},
    preset: {noteOn: a.get(0xd88), noteOff: a.get(0xdd8),
      pedal: a.get(0xe28), pitch: a.get(0xe78), pedalInvert: a.get(0xf20)},
  };
}
