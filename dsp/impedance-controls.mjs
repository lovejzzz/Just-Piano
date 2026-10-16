// Archive-backed coupling controls, 4052c4 / 1b2a58 / 721744 / 11dfd0.
import { fma32 } from './modal-kernel.mjs';
import { linearModelCurve } from './model-curves.mjs';
const fl = Math.fround;

export function impedanceControls({ baseFields, presetFields, note, mode, runtimeCurveMode }) {
  if (![0, 1].includes(mode) || !Number.isFinite(note)) throw new RangeError('Finite pitch and supported polarization required');
  const fields = rows => new Map(rows.map(row => [row.object_offset, row.value]));
  const b = fields(baseFields), a = fields(presetFields);
  if (a.get(0x1398) !== 0) throw new RangeError('Ageing branch requires additional seeded state');
  const control = b.get(0x2a38), edited = a.get(0x588), anchors = b.get(0x1bf8);
  const components = b.get(0x2548)?.indexmap;
  if (!control || !edited || !anchors || anchors.length < 2 || !components) throw new TypeError('Missing decoded coupling controls');
  note = fl(note);
  let left = 0;
  if (note >= fl(anchors.at(-1))) left = anchors.length - 2;
  else if (note > fl(anchors[0])) left = anchors.findIndex((v, i) => i < anchors.length - 1 && note <= fl(anchors[i + 1]));
  const right = left + 1;
  const d = fl(fl(anchors[right]) - fl(anchors[left]));
  if (!(d > 0)) throw new RangeError('Pitch anchors must increase');
  const t = Math.max(0, Math.min(1, fl(fl(note - fl(anchors[left])) / d)));
  const evaluate = curve => {
    const values = linearModelCurve(curve, note, { runtimeMode: runtimeCurveMode });
    if (values.length !== 1) throw new RangeError('Scalar pitch curve required');
    return values[0];
  };
  const sample = (offset, index) => {
    const value = b.get(offset)?.[index];
    if (!Number.isFinite(value)) throw new RangeError('Missing per-anchor coefficient');
    return fl(value);
  };
  const mix = (v0, v1) => fma32(fl(1 - t), v0, fl(t * v1));
  const componentCount = pitch => {
    const result = components[Math.trunc(fl(pitch))] ?? 0;
    if (!(result > 0)) throw new RangeError('Positive component count required');
    return fl(result);
  };
  const count = componentCount(note), c0 = componentCount(anchors[left]), c1 = componentCount(anchors[right]);
  const editScales = edited.scalars.map(fl);
  const clamp = (value, high) => Math.max(fl(0.1), Math.min(high, value));
  const values = [0, 1, 2].map(i => {
    const raw = fl(fl(evaluate(control.curves[i]) * evaluate(edited.curves[i])) * editScales[i]);
    let scale = clamp(raw, i === 0 ? 20 : 10);
    if (mode) scale = fl(scale * evaluate(control.curves248[i]));
    return scale;
  });
  const strength = fl(values[0] * fl(mix(fl(sample(0x1d48, left) / c0), fl(sample(0x1d48, right) / c1)) * count));
  const lowCutoff = fl(values[1] * mix(sample(0x1d18, left), sample(0x1d18, right)));
  const tilt = fl(values[2] * mix(sample(0x1d60, left), sample(0x1d60, right)));
  return { controls: { '0x20': strength, '0x38': lowCutoff, '0x50': tilt, '0xc8': fl(control.scalar148) },
    phaseCurve: control.curves[3], bandFrequencies: control.vectors[0], bandGains: control.vectors[1],
    anchors: { left, right, t }, componentCount: count };
}
