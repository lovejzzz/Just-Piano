// 529090: archived harmonic amplitudes -> runtime excitation weights.
// Double log/exp remain explicit host dependencies; no whole-domain native
// equivalence is implied by the observed float32 output comparisons.
import { fma64 } from './modal-poles.mjs';
import { nativeScalarLogf } from './native-scalar-log.mjs';
import { linearModelCurve } from './model-curves.mjs';
const fl = Math.fround;
const DB_SCALE = 0.11512925464970229; // binary64 0x3fbd791c5f888823

export function sourceWeights(input, { log, exp } = {}) {
  if (typeof log !== 'function' || typeof exp !== 'function') {
    throw new TypeError('Explicit double log and exp dependencies required');
  }
  const { weights, coordinates, harmonic_edits: edits, active_edit_curve: active,
    edit_curve: editCurve, base_curve: baseCurve, weightOffset } = input;
  const c = input.controls, g = input.G_controls;
  if (!weights?.length || coordinates?.length !== weights.length || !edits?.length || edits.at(-1) !== 0 ||
      ![...weights, ...coordinates, ...edits, ...Object.values(c), ...Object.values(g), weightOffset].every(Number.isFinite) ||
      !Number.isInteger(weightOffset) || weightOffset < 0 || weightOffset > 0xffffffff) {
    throw new RangeError('Complete finite source vectors and observed registry offset required');
  }
  const evaluate = (curve, x) => {
    if (curve.special_mode !== 0 || (curve.log_x & 1) || curve.dimension !== 1) {
      throw new RangeError('Only observed linear scalar runtime curves are supported');
    }
    return linearModelCurve(curve, x, { runtimeMode: 'linear-clamp' })[0];
  };
  const frequency = fl(g['0x78']), stiffness = fl(g['0x28']);
  if (!(frequency > 0 && g['0xd8'] > 0 && c.s3 > 0)) throw new RangeError('Positive model scales required');
  const physicalFrequencies = coordinates.map((n) => {
    n = fl(n);
    return (n * frequency) * Math.sqrt(fma64(n * n, stiffness, 1));
  });
  const shaped = weights.map((value, i) => {
    if (!(value > fl(1e-35))) throw new RangeError('Native positive-weight branch required');
    const x = fl(log(physicalFrequencies[i]));
    const db = (active ? evaluate(editCurve, x) : 0) + fl(fl(1 - fl(c.s0)) * evaluate(baseCurve, x));
    return fl((db === 0 ? 1 : exp(db * DB_SCALE)) * fl(value));
  });
  const harmonicCurve = { x: edits.map((_, i) => fl(i + 1)), y: edits };
  const edited = shaped.map((value, i) => {
    const db = linearModelCurve(harmonicCurve, coordinates[i], { runtimeMode: 'linear-clamp' })[0];
    return fl((db === 0 ? 1 : exp(db * DB_SCALE)) * value);
  });
  const logBase = nativeScalarLogf(fl(g['0xd8']));
  const output = edited.map((value, i) => {
    const position = (physicalFrequencies[i] - fl(c.s2)) / fl(c.s3);
    const square = position * position;
    const gaussian = square > 100 ? 3.720075976020836e-44 : exp(-square);
    const logWeight = log(value - weightOffset);
    const baseline = fma64(-(physicalFrequencies[i] / frequency), fl(g['0xf0']), logBase);
    const mix = fma64(gaussian, fl(fl(c.s1) - 1), 1);
    return fl(exp(fma64(logWeight - baseline, mix, baseline)));
  });
  if (![...physicalFrequencies, ...shaped, ...edited, ...output].every(Number.isFinite)) {
    throw new RangeError('Nonfinite source-weight result');
  }
  return { physicalFrequencies, shaped, edited, output };
}
