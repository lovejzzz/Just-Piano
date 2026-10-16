// 715f98: append the independently excited secondary source and vary phases.
import { sourceSquaredNorm } from './post-excitation.mjs';
import { fma32 } from './modal-kernel.mjs';
const f32 = Math.fround;
const PI = f32(Math.PI);

function assertRandomState(state) {
  if (!state || state.length !== 4 || !state.every(x => Number.isInteger(x) && x >= 0 && x <= 0xffffffff))
    throw new RangeError('Four unsigned random-state words required');
}

export function nextExcitationRandom(state) {
  assertRandomState(state);
  let t = (state[0] ^ (state[0] << 11)) >>> 0;
  t = (t ^ (t >>> 8) ^ state[3] ^ (state[3] >>> 19)) >>> 0;
  state[0] = state[1]; state[1] = state[2]; state[2] = state[3]; state[3] = t;
  return t;
}

export function mergeExcitationSources({ primary, primaryHeader, secondary, secondaryHeader, secondaryStorage, controls }) {
  const columns = primaryHeader[0], primaryRows = primaryHeader[1], secondaryRows = secondaryHeader[1];
  if (![columns, primaryRows, secondaryRows].every(Number.isInteger) || columns < 1 || columns > 3 ||
      primaryRows < 1 || secondaryRows < 1 || secondaryHeader[0] !== columns || controls.mode !== 2 ||
      primaryHeader[2] || primaryHeader[3] || secondaryHeader[2] || secondaryHeader[3] ||
      !Number.isInteger(primaryHeader[5]) || primaryHeader[5] < 0 || primaryHeader[5] > primaryRows ||
      !Number.isFinite(controls.mergeControl) || controls.mergeControl > 0 ||
      ![controls.primaryGain, controls.secondaryGain, controls.amplitudeGain].every(Number.isFinite) ||
      !['frequency', 'decay', 'amplitude', 'phase'].every(key =>
        primary[key]?.length === primaryRows * columns && secondary[key]?.length === secondaryRows * columns &&
        [...primary[key], ...secondary[key]].every(Number.isFinite)) ||
      secondaryStorage.length !== Math.ceil(secondaryRows * columns / 4) * 4 ||
      !secondaryStorage.slice(secondaryRows * columns).every(x => x === 0) ||
      !secondary.amplitude.every((x, i) => f32(x) === f32(secondaryStorage[i])))
    throw new RangeError('Complete same-column sources and supported append controls required');
  const prefix = Math.min(primaryHeader[5], secondaryRows) * columns;
  const scaledPrimary = Object.fromEntries(Object.entries(primary).map(([key, values]) => [key, values.map(f32)]));
  for (let i = 0; i < prefix; i++) scaledPrimary.amplitude[i] = f32(f32(controls.primaryGain) * scaledPrimary.amplitude[i]);
  const norm = sourceSquaredNorm(secondaryStorage);
  const target = f32(f32(controls.amplitudeGain) * f32(controls.secondaryGain));
  const gain = f32(target / f32(f32(Math.sqrt(norm)) + f32(1e-20)));
  const source = Object.fromEntries(Object.entries(scaledPrimary).map(([key, values]) =>
    [key, [...values, ...secondary[key].map(x => key === 'amplitude' ? f32(f32(x) * gain) : f32(x))]]));
  const header = [...primaryHeader]; header[1] = primaryRows + secondaryRows;
  return { source, header, scaledPrimary, secondaryNorm: norm, secondaryNormalizationGain: gain, primaryScaledLanes: prefix };
}

export function varyExcitationPhases({ frequency, phase, columns, phaseSpread, timeSpread, phaseStartRow, randomState }) {
  assertRandomState(randomState);
  if (!Number.isInteger(columns) || columns < 1 || columns > 3 || !phase.length || phase.length % columns ||
      frequency.length !== phase.length || ![...frequency, ...phase, phaseSpread, timeSpread].every(Number.isFinite) ||
      !Number.isInteger(phaseStartRow) || phaseStartRow < 0 || phaseStartRow > phase.length / columns)
    throw new RangeError('Complete phase variation inputs required');
  const state = [...randomState], result = phase.map(f32), rows = phase.length / columns;
  const spread = f32(Math.max(0, Math.min(1, f32(phaseSpread))));
  const scale = f32(f32(spread + spread) * PI), time = f32(f32(timeSpread) * f32(0.001));
  let draws = 0;
  const uniform = () => { draws++; return f32(f32(nextExcitationRandom(state) / 4294967296) - 0.5); };
  if (spread > 0 || timeSpread > 0) for (let row = phaseStartRow; row < rows; row++) {
    const first = row * columns;
    const common = f32(f32(f32(fma32(time, f32(frequency[first]), 0) * uniform()) * 2) * PI);
    result[first] = f32(result[first] + f32(fma32(scale, uniform(), common) + 0));
    for (let column = 1; column < columns; column++) {
      const lane = first + column;
      const base = fma32(scale, uniform(), common);
      const extra = f32(fma32(time, f32(frequency[lane]), 0) * uniform());
      result[lane] = f32(result[lane] + fma32(f32(extra + extra), PI, base));
    }
  }
  return { phase: result, randomState: state, randomDraws: draws };
}
