import {fma32} from './modal-kernel.mjs';
import {constructSoundboardLaplacian} from './soundboard-laplacian.mjs';
import {solveSoundboardCg} from './soundboard-cg.mjs';
const f = Math.fround;

export function constructSoundboardMatrices(grid, {method, baseScale, bridgeScaleAdd, contrast, traceCount = 0}) {
  if (![baseScale, bridgeScaleAdd, contrast].every((v) => Number.isFinite(v) && Number.isFinite(f(v))) ||
      !(f(baseScale) > 0) || !(f(contrast) > 0) || !grid.active?.length) throw new RangeError('Finite supported matrix controls required');
  const laplacian = constructSoundboardLaplacian(grid, method);
  const solve = solveSoundboardCg(laplacian.reduced, new Float32Array(grid.active.length).fill(-1), {traceCount});
  let peak = 0;
  for (const value of solve.solution) peak = Math.max(peak, Math.abs(value));
  if (!(peak > 0)) throw new RangeError('Nonzero spatial solution required');
  const shape = new Float32Array(grid.size), normalization = f(1 / peak);
  for (let i = 0; i < grid.active.length; i++) shape[grid.active[i]] = f(solve.solution[i] * normalization);
  const delta = f(f(contrast) - 1);
  const scaled = laplacian.full.map((row, i) => {
    const scale = f(f(baseScale) * f(fma32(delta, shape[i], 1) / f(contrast)));
    return row.map((entry) => ({index: entry.index, value: f(scale * entry.value)}));
  });
  const bridgeRatio = f(f(f(baseScale) + f(bridgeScaleAdd)) / f(baseScale));
  for (const index of grid.bridgeIndices) {
    if (index >= grid.size) throw new RangeError('Bridge index outside grid');
    for (const entry of scaled[index]) entry.value = f(entry.value * bridgeRatio);
  }
  const active = new Set(grid.active);
  const matrixC = scaled.map((row, i) => active.has(i) ? row.filter((entry) => entry.value !== 0) : []);
  const matrixA = scaled.map((row, i) => {
    if (!active.has(i)) return [];
    const values = new Map();
    for (const outer of row) for (const inner of matrixC[outer.index]) {
      values.set(inner.index, f(f(outer.value * inner.value) + (values.get(inner.index) ?? 0)));
    }
    return [...values].sort((a, b) => a[0] - b[0]).map(([index, value]) => ({index, value}));
  });
  return {matrixA, matrixC, shape, solve, laplacian, normalization};
}
