// Recovered archive-to-control arithmetic for the observed ARM64 build.
// Archive compression flags do not establish runtime log-X/special modes.
import { fma32 } from './modal-kernel.mjs';
import {clampHammerHardnessTable} from './hammer-all-hardness.mjs';
const fl = Math.fround;

export function linearModelCurve(curve, input, { runtimeMode } = {}) {
  if (runtimeMode !== 'linear-clamp') throw new RangeError('Runtime curve mode must be independently established');
  const { x, y } = curve ?? {};
  if (!Array.isArray(x) || !Array.isArray(y) || !y.length ||
      (x.length && y.length % x.length) || ![input, ...x, ...y].every(Number.isFinite)) {
    throw new TypeError('Finite coordinates and complete output rows required');
  }
  // The archive stores constant curves with an empty X vector.
  if (!x.length) return y.map(fl);
  const dim = y.length / x.length;
  const xs = x.map(fl);
  for (let i = 1; i < xs.length; i++) {
    if (!(xs[i] > xs[i - 1])) throw new RangeError('Curve coordinates must increase after float32 conversion');
  }
  const n = fl(input);
  if (n <= xs[0]) return y.slice(0, dim).map(fl);
  if (n >= xs.at(-1)) return y.slice(-dim).map(fl);
  const i = xs.findIndex((v, j) => j < xs.length - 1 && v <= n && n < xs[j + 1]);
  const d = fl(xs[i + 1] - xs[i]);
  const t = d > 1e-30 ? fl(fl(n - xs[i]) / d) : 1;
  const complement = fl(1 - t);
  // Both 44f8a4 scalar and 09edcc vector round t*new before fusing a*old.
  // In 09edcc, s17=t and s0=1-t: tracking their definitions matters.
  return Array.from({ length: dim }, (_, k) =>
    fma32(complement, fl(y[i * dim + k]), fl(t * fl(y[(i + 1) * dim + k]))));
}

// The archive-to-runtime association has been observed for note 69 only.
// Nonzero All hardness and other pitch/mode branches remain unverified.
export function archiveHardnessAt69({ baseFields, presetFields, note, runtimeMode }) {
  if (note !== 69) throw new RangeError('Only note 69 has archive-to-runtime evidence');
  const fields = (rows) => new Map(rows.map((row) => [row.object_offset, row.value]));
  const base = fields(baseFields);
  const h = fields(presetFields).get(0x9a8);
  if (!h || h.scalars?.length !== 5 || h.curves?.length < 4 ||
      ![h.s10, ...h.scalars].every(Number.isFinite)) {
    throw new TypeError('Missing decoded A hardness fields');
  }
  const evaluate = (curve) => linearModelCurve(curve, note, { runtimeMode });
  const scalarCurve = (curve) => {
    const values = evaluate(curve);
    if (values.length !== 1) throw new RangeError('Scalar curve expected');
    return values[0];
  };
  const all = Math.max(-1, Math.min(1, fl(fl(h.s10) + scalarCurve(h.curve170))));
  if (all !== 0) throw new RangeError('Nonzero All hardness is outside the validated branch');
  const groupValues = [1, 2, 3].map((i) => fl(fl(h.scalars[i]) * scalarCurve(h.curves[i])));
  const multipliers = [groupValues[0], groupValues[0], groupValues[1], groupValues[2], groupValues[2]];
  const tables = [0xc58, 0xe38].map((offset) =>
    clampHammerHardnessTable(multipliers.map((gain, k) => fl(gain * scalarCurve(base.get(offset + 0x50 * k))))));
  const knots = evaluate(base.get(0xde8));
  if (knots.length !== 5) throw new RangeError('Five hardness knots required');
  return { note, groupValues, all, knots, tables };
}
