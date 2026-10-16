// 6164fc: sum-frequency modes, component spread, and source energy scaling.
import { fma32 } from './modal-kernel.mjs';
import { nativeScalarExp } from './native-scalar-exp.mjs';
const f32 = Math.fround;
const view = new DataView(new ArrayBuffer(4));
const word = x => { view.setUint32(0, x); return view.getFloat32(0); };

// 1d17f8 with boundary mode 3; reciprocal-then-multiply differs from division.
export function compactScalarCurve(curve, input) {
  if (curve.dimension !== 1 || curve.log_x !== 0 || curve.special_mode !== 0 ||
      !curve.y?.length || ![input, ...curve.x, ...curve.y].every(Number.isFinite) ||
      (curve.x.length && curve.x.length !== curve.y.length)) throw new RangeError('Plain scalar runtime curve required');
  const x = curve.x.map(f32), y = curve.y.map(f32), n = f32(input);
  for (let i = 1; i < x.length; i++) if (x[i] <= x[i - 1]) throw new RangeError('Increasing curve coordinates required');
  if (x.length <= 1 || n <= x[0]) return y[0];
  if (n >= x.at(-1)) return y.at(-1);
  const i = x.findIndex((v, i) => i + 1 < x.length && v <= n && n < x[i + 1]);
  const dx = f32(x[i + 1] - x[i]), reciprocal = dx > 1e-30 ? f32(1 / dx) : 0;
  const t = f32(f32(n - x[i]) * reciprocal);
  return fma32(f32(1 - t), y[i], f32(t * y[i + 1]));
}

export function sourceSquaredNorm(storage) {
  if (!storage.length || storage.length % 4 || !Array.from(storage).every(Number.isFinite))
    throw new RangeError('Complete padded four-lane amplitude storage required');
  const acc = new Float32Array(4);
  for (let i = 0; i < storage.length; i++) acc[i % 4] = fma32(storage[i], storage[i], acc[i % 4]);
  return f32(f32(acc[0] + acc[2]) + f32(acc[1] + acc[3]));
}

export function postExcitationTables(input, { pow } = {}) {
  const { source, amplitudeStorage, columns, combinationRows, combinationCount, combinationStart,
    weightCurve, decayCurve, velocity, hostCount, combinationCutoff, velocityGainDb, combinationGain,
    amplitudeGain, dampingBlend, quadraticBlend, spreadControl, quadraticDecay, noteIndex,
    expression, spreadVariationEnabled } = input;
  const size = source.frequency?.length, rows = size / columns;
  if (!Number.isInteger(columns) || columns < 1 || columns > 3 || !Number.isInteger(rows) || rows < 1 ||
      !['frequency', 'decay', 'amplitude', 'phase'].every(key => source[key]?.length === size && Array.from(source[key]).every(Number.isFinite)) ||
      amplitudeStorage?.length !== Math.ceil(size / 4) * 4 ||
      !Array.from(amplitudeStorage).slice(size).every(x => x === 0) ||
      !Array.from(source.amplitude).every((x, i) => f32(x) === f32(amplitudeStorage[i])))
    throw new RangeError('Complete source tables and zero-padded amplitude storage required');
  if (![velocity, hostCount, combinationCutoff, velocityGainDb, combinationGain, amplitudeGain, dampingBlend,
    quadraticBlend, spreadControl, quadraticDecay, noteIndex, expression].every(Number.isFinite) || hostCount <= 0 || noteIndex <= 0 ||
    !Number.isInteger(combinationCount) || combinationCount < 1 || !Number.isInteger(combinationStart) || combinationStart < 0 ||
    combinationRows.length < combinationCount || !combinationRows.every(x => Number.isInteger(x) && x >= 0 && x < rows) ||
    expression !== 0 || spreadVariationEnabled !== false || typeof pow !== 'function')
    throw new RangeError('Unsupported post-excitation controls or missing explicit pow');
  const result = Object.fromEntries(Object.entries(source).map(([key, values]) => [key, Array.from(values, f32)]));
  const norm = sourceSquaredNorm(amplitudeStorage);
  const db = f32(f32(velocityGainDb) * f32(1 - Math.min(f32(velocity), 1)));
  const velocityGain = db === 0 ? 1 : nativeScalarExp(f32(db * word(0x3debc8e3)));
  const dampExponent = f32(f32(1 - f32(dampingBlend)) * word(0xc0dd0c55));
  const dampingGain = nativeScalarExp(dampExponent);
  const gain = f32(f32(f32(f32(f32(velocity) * f32(f32(combinationGain) * velocityGain)) * 21) / f32(hostCount)) * dampingGain);
  let weightSum = 0;
  const combinations = [];
  for (let i = 0; i < combinationRows.length; i++) {
    const first = combinationRows[i];
    if (source.frequency[first * columns] >= f32(f32(combinationCutoff) * 0.5)) break;
    for (let j = combinationStart; j < combinationStart + combinationCount && i + j < combinationRows.length; j++) {
      const second = combinationRows[i + j], outputRow = result.frequency.length / columns;
      for (let c = 0; c < columns; c++) {
        const a = first * columns + c, b = second * columns + c;
        const frequency = f32(source.frequency[a] + source.frequency[b]);
        const weight = compactScalarCurve(weightCurve, frequency);
        result.frequency.push(frequency);
        result.decay.push(f32(source.decay[a] + source.decay[b]));
        result.amplitude.push(f32(f32(gain * weight) * f32(source.amplitude[a] * source.amplitude[b])));
        result.phase.push(f32(source.phase[a] + source.phase[b]));
        weightSum = f32(weightSum + weight);
      }
      combinations.push({ first, second, outputRow });
    }
  }
  for (const { outputRow } of combinations) {
    const scale = compactScalarCurve(decayCurve, result.frequency[outputRow * columns]);
    for (let c = 0; c < columns; c++) result.decay[outputRow * columns + c] = f32(scale * result.decay[outputRow * columns + c]);
  }
  const average = combinations.length ? f32(f32(combinationGain) * f32(weightSum / f32(combinations.length * columns))) : 1;
  const blend = fma32(average, f32(quadraticBlend), f32(1 - f32(quadraticBlend)));
  const spreadInput = f32(((((pow(f32(velocity), 3) * blend) * f32(f32(spreadControl) - 1)) * 60) / hostCount) + 1);
  if (!Number.isFinite(spreadInput)) throw new RangeError('Nonfinite spread');
  if (columns > 1 && spreadInput !== 1) for (let row = 0; row < result.frequency.length / columns; row++) {
    let mean = 0;
    for (let c = 0; c < columns; c++) mean = f32(mean + result.frequency[row * columns + c]);
    mean = f32(f32(1 / f32(columns)) * mean);
    for (let c = 0; c < columns; c++) {
      const i = row * columns + c;
      result.frequency[i] = fma32(spreadInput, f32(result.frequency[i] - mean), mean);
    }
  }
  const target = f32(velocity > 1 ? f32(f32(velocity) * f32(amplitudeGain)) : amplitudeGain);
  const normalizationGain = f32(target / f32(f32(Math.sqrt(norm)) + word(0x1e3ce508)));
  result.amplitude = result.amplitude.map(x => f32(x * normalizationGain));
  const feedbackGain = quadraticBlend > 0 ? f32(f32(average * f32(quadraticBlend)) * f32(21 / f32(noteIndex))) : 0;
  return { source: result, rows: result.frequency.length / columns, combinations, norm, normalizationGain,
    spreadInput, average, gain, velocityGain, dampingGain, feedbackGain,
    feedbackDecay: quadraticBlend > 0 ? f32(f32(quadraticDecay) * feedbackGain) : 0 };
}
