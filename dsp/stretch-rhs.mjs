// 326fe0: stiffness-dependent log-frequency interval constraints.
// Native transcendental calls are explicit; 545600 returns the fixed limit 15.
import { fma64 } from './modal-poles.mjs';
import { fma32 } from './modal-kernel.mjs';
import { impedancePhaseCurve } from './modal-impedance.mjs';
import { stretchSmooth } from './stretch-smoothing.mjs';
const f = Math.fround;
const roundAway = value => value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5);

// 3d2f7c copies A400/A408 to T50/T58, A46c to T38 and B1b34 to
// T20; 9540e4 combines B1be8 and A458 into T_b8 with float FMSUB.
export function archiveStretchControls(baseFields, presetFields, runtimeCurveMode) {
  const field = (rows, offset) => {
    const entry = rows.find(row => row.object_offset === offset);
    if (!entry) throw new RangeError(`Missing stretch archive field 0x${offset.toString(16)}`);
    return entry.value;
  };
  const referenceHz = f(field(baseFields, 0x1b34)), stretch = f(field(presetFields, 0x46c));
  const baseSmoothing = f(field(baseFields, 0x1be8)), editSmoothing = f(field(presetFields, 0x458));
  if (![referenceHz, stretch, baseSmoothing, editSmoothing].every(Number.isFinite) || referenceHz <= 0)
    throw new RangeError('Finite archive stretch controls required');
  const complement = x => x < 0 ? 1 : f(1 - Math.min(1, x));
  const smoothing = fma32(-complement(baseSmoothing), complement(editSmoothing), 1);
  const indexCurve = field(presetFields, 0x400);
  const { flags, special, dimension } = runtimeCurveMode ?? {};
  if (!Number.isInteger(flags) || !Number.isInteger(special) || dimension !== 1 || !indexCurve.curve)
    throw new RangeError('Explicit runtime scalar curve mode required');
  return { interval: indexCurve.index, referenceHz, stretch, smoothing,
    weightCurve: { ...indexCurve.curve, log_x: flags, special_mode: special, dimension } };
}

export function stretchIntervalRatio(interval, math) {
  if (!Number.isInteger(interval) || interval < 1 || interval > 106)
    throw new RangeError('Integer stretch interval 1..106 required');
  if (typeof math?.exp2 !== 'function') throw new TypeError('Explicit native exp2 required');
  const ratio = roundAway(f(math.exp2(interval / 12) * 4)) / 4;
  let numerator = roundAway(ratio), denominator = fma64(numerator, 0, 1);
  let remainder = ratio - numerator, oldNumerator = 1, oldDenominator = 0;
  for (let iteration = 0; remainder !== 0; iteration++) {
    if (iteration > 100) throw new RangeError('Rational approximation did not converge');
    if (Math.abs(numerator / denominator - ratio) < 1e-5) break;
    const reciprocal = 1 / remainder, step = roundAway(reciprocal);
    remainder = reciprocal - step;
    const nextNumerator = fma64(numerator, step, oldNumerator);
    const nextDenominator = fma64(denominator, step, oldDenominator);
    oldNumerator = numerator; oldDenominator = denominator;
    numerator = nextNumerator; denominator = nextDenominator;
  }
  return { ratio, numerator, denominator: numerator < 0 ? -roundAway(denominator) : roundAway(denominator) };
}

export function stretchPartialLimit(rational) {
  const numerator = Math.abs(roundAway(rational.numerator));
  if (!Number.isInteger(numerator) || numerator < 1 || numerator > 0x7fffffff)
    throw new RangeError('Supported rational numerator required');
  return Math.floor(15 / numerator);
}

export function stretchPartialCounts(weightCurve, rational) {
  const partialLimit = stretchPartialLimit(rational);
  if (!Number.isInteger(partialLimit) || partialLimit < 0 || !Number.isInteger(rational.denominator) ||
      rational.denominator < 1) throw new RangeError('Explicit nonnegative partial limit and rational denominator required');
  const curve = { ...weightCurve, flags: weightCurve.log_x, special: weightCurve.special_mode };
  return Int32Array.from({ length: 115 }, (_, note) =>
    Math.min(roundAway(impedancePhaseCurve(curve, note)), partialLimit) * rational.denominator);
}

export function stretchRawConstraints({ interval, ratio, partials, stiffnessTable, stretch }, math) {
  if (!Number.isInteger(interval) || interval < 1 || interval > 106 || partials.length !== 115 ||
      stiffnessTable.length !== 128 || ![ratio, stretch, ...stiffnessTable].every(Number.isFinite) ||
      !Array.from(partials).every(x => Number.isInteger(x) && x > 0))
    throw new RangeError('Complete finite stiffness and positive partial counts required');
  if (typeof math?.log2 !== 'function') throw new TypeError('Explicit native log2 required');
  const n = 107 - interval, raw = new Float32Array(n), scaledLow = new Float64Array(n), scaledHigh = new Float64Array(n);
  for (let r = 0; r < n; r++) {
    const low = stiffnessTable[r + 8] * f(stretch), high = stiffnessTable[r + 8 + interval] * f(stretch);
    scaledLow[r] = low; scaledHigh[r] = high;
    const p32 = f(partials[r + 8]), p = p32, q = ratio * p;
    const lowPartial = (q * Math.sqrt(fma64(low, q * q, 1))) / Math.sqrt(low + 1);
    const highPartial = (p * Math.sqrt(fma64(high, f(p32 * p32), 1))) / Math.sqrt(high + 1);
    raw[r] = math.log2(lowPartial / highPartial);
  }
  return { raw, scaledLow, scaledHigh };
}

export function stretchConstraintRhs({ interval, raw, referenceHz, smoothing }, math) {
  if (!Number.isInteger(interval) || interval < 1 || interval > 106 || raw.length !== 107 - interval ||
      !Array.from(raw).every(Number.isFinite) || !Number.isFinite(referenceHz) || referenceHz <= 0 || !Number.isFinite(smoothing))
    throw new RangeError('Finite constraints, positive reference frequency and smoothing required');
  if (typeof math?.log2 !== 'function') throw new TypeError('Explicit native log2 required');
  let values = Float32Array.from(raw), normalized = null, filtered = null;
  if (f(smoothing) > 0.0001) {
    const offset = values[0];
    normalized = Float32Array.from(values, value => f(value - offset));
    filtered = stretchSmooth(normalized, smoothing, true, math);
    values = Float32Array.from(filtered.values, value => f(offset + value));
  }
  const rhs = new Float64Array(215 - interval);
  rhs[107] = math.log2(f(referenceHz));
  rhs.set(values, 108);
  return { rhs, values, normalized, filtered };
}
