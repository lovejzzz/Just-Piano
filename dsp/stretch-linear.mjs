// Double matrix arithmetic recovered from arm64 69125c, 47b808, 2917dc,
// 2311e4, 185ec0 and 1db468. Storage is values[column * rows + row].
import { fma64 } from './modal-poles.mjs';

function matrix(input) {
  const { rows, columns, values } = input;
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 ||
      input.layout !== 'column-major' || values.length !== rows * columns || !Array.from(values).every(Number.isFinite))
    throw new RangeError('Finite, nonempty column-major matrix required');
  return input;
}
const resultMatrix = (rows, columns, values) => ({ rows, columns, values, layout: 'column-major' });

// 68c748 -> 69125c, transposed-left expression used by 326fe0. Native
// eight-term prefixes use separately rounded products and sequential adds;
// only the remainder uses fused multiply-add. Do not replace with all-FMA dot.
export function stretchGram(input) {
  const { rows, columns, values } = matrix(input), out = new Float64Array(columns * columns);
  const prefix = rows >= 8 ? rows - rows % 8 : 0;
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < columns; j++) {
      let sum = 0;
      for (let k = 0; k < prefix; k++) sum += values[i * rows + k] * values[j * rows + k];
      for (let k = prefix; k < rows; k++) sum = fma64(values[i * rows + k], values[j * rows + k], sum);
      out[j * columns + i] = sum;
    }
  }
  return resultMatrix(columns, columns, out);
}

// 47b808 assignment: double multiply, not FMA.
export function stretchScale(input, factor) {
  const { rows, columns, values } = matrix(input);
  if (!Number.isFinite(factor)) throw new RangeError('Finite scale required');
  return resultMatrix(rows, columns, Float64Array.from(values, value => factor * value));
}

// 2917dc accumulation: fused double product-plus-destination in both SIMD
// and scalar paths. A fresh result preserves distinct-input alias semantics.
export function stretchAddScaled(destination, source, factor) {
  matrix(destination); matrix(source);
  if (destination.rows !== source.rows || destination.columns !== source.columns || !Number.isFinite(factor))
    throw new RangeError('Matching matrices and finite scale required');
  return resultMatrix(destination.rows, destination.columns,
    Float64Array.from(destination.values, (value, index) => fma64(factor, source.values[index], value)));
}

// 2311e4: unscaled partial row pivoting, first candidate wins ties. Every
// multiplier uses direct division, followed by negative-multiplier FMA rank-1
// updates. Final diagonal is not tested by the original routine.
export function stretchLuFactor(input) {
  const { rows: n, columns, values } = matrix(input);
  if (n !== columns) throw new RangeError('This recovery implements square LU only');
  const lu = Float64Array.from(values), pivots = Int32Array.from({ length: n }, (_, k) => k < n - 1 ? k : 0);
  for (let k = 0; k < n - 1; k++) {
    let pivot = k, magnitude = Math.abs(lu[k * n + k]);
    for (let row = k + 1; row < n; row++) {
      const candidate = Math.abs(lu[k * n + row]);
      if (candidate > magnitude) { pivot = row; magnitude = candidate; }
    }
    pivots[k] = pivot + 1;
    if (magnitude === 0) return { lu: resultMatrix(n, n, lu), pivots, info: k + 1 };
    if (pivot !== k) {
      for (let column = 0; column < n; column++) {
        const at = column * n, old = lu[at + pivot];
        lu[at + pivot] = lu[at + k]; lu[at + k] = old;
      }
    }
    const diagonal = lu[k * n + k];
    for (let row = k + 1; row < n; row++) lu[k * n + row] /= diagonal;
    for (let column = k + 1; column < n; column++) {
      const upper = lu[column * n + k];
      for (let row = k + 1; row < n; row++)
        lu[column * n + row] = fma64(upper, -lu[k * n + row], lu[column * n + row]);
    }
  }
  pivots[n - 1] = n;
  return { lu: resultMatrix(n, n, lu), pivots, info: 0 };
}

// 185ec0: copy RHS, apply 1-based pivot swaps, unit-lower forward updates,
// then upper backward division/updates. FMLS is fma(-coefficient, x, old).
export function stretchLuSolve(factorization, rhs) {
  const { lu: input, pivots, info } = factorization;
  const { rows: n, columns, values } = matrix(input);
  if (n !== columns || rhs.length !== n || pivots.length !== n || !Array.from(rhs).every(Number.isFinite))
    throw new RangeError('Square LU, matching RHS and pivots required');
  if (info !== 0) throw new RangeError(`Native LU factorization returned info=${info}`);
  const solution = Float64Array.from(rhs);
  for (let k = 0; k < n; k++) {
    const pivot = pivots[k] - 1;
    if (!Number.isInteger(pivot) || pivot < 0 || pivot >= n) throw new RangeError('Invalid 1-based pivot');
    if (pivot !== k) {
      const old = solution[k]; solution[k] = solution[pivot]; solution[pivot] = old;
    }
  }
  for (let k = 0; k < n; k++) {
    const value = solution[k];
    for (let row = k + 1; row < n; row++) solution[row] = fma64(-value, values[k * n + row], solution[row]);
  }
  for (let k = n - 1; k >= 0; k--) {
    solution[k] /= values[k * n + k];
    const value = solution[k];
    for (let row = 0; row < k; row++) solution[row] = fma64(-value, values[k * n + row], solution[row]);
  }
  return solution;
}

// 1db468, distinct input/output path: zero output and accumulate columns in
// ascending order. This is a matrix-vector product, not the LU solver.
export function stretchMatvec(input, vector) {
  const { rows, columns, values } = matrix(input);
  if (vector.length !== columns || !Array.from(vector).every(Number.isFinite)) throw new RangeError('Matching finite vector required');
  const out = new Float64Array(rows);
  for (let column = 0; column < columns; column++)
    for (let row = 0; row < rows; row++) out[row] = fma64(vector[column], values[column * rows + row], out[row]);
  return out;
}
