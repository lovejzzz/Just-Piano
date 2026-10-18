import {fma32} from './modal-kernel.mjs';
const f = Math.fround;

export function soundboardOrderedDot(a, b) {
  if (!(a instanceof Float32Array) || !(b instanceof Float32Array) || a.length !== b.length) throw new RangeError('Aligned float32 vectors required');
  const end = Math.trunc(a.length / 4) * 4;
  let sum = 0;
  for (let i = 0; i < end; i++) sum = f(sum + f(a[i] * b[i]));
  for (let i = end; i < a.length; i++) sum = fma32(a[i], b[i], sum);
  return sum;
}

function multiply(rows, x) {
  return Float32Array.from(rows, (row) => {
    let sum = 0;
    for (const entry of row) sum = fma32(entry.value, x[entry.index], sum);
    return sum;
  });
}

export function solveSoundboardCg(rows, rhs, {tolerance = Math.fround(1e-7), maxIterations = 10000, traceCount = 0} = {}) {
  if (!(rhs instanceof Float32Array) || !rhs.length || rhs.some((v) => !Number.isFinite(v)) || !Array.isArray(rows) || rows.length !== rhs.length ||
      !Number.isFinite(tolerance) || tolerance <= 0 || !Number.isInteger(maxIterations) || maxIterations < 1 ||
      !Number.isInteger(traceCount) || traceCount < 0) {
    throw new RangeError('Finite system and positive CG controls required');
  }
  for (const row of rows) for (const entry of row) {
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= rhs.length || !Number.isFinite(entry.value)) throw new RangeError('Invalid sparse CG entry');
  }
  const solution = new Float32Array(rhs.length), residual = rhs.slice();
  let z = residual.slice(), direction = residual.slice(), q = new Float32Array(rhs.length);
  let rho = soundboardOrderedDot(z, residual), previousRho = rho, iteration = 0;
  const norm = (x) => f(Math.sqrt(Math.abs(soundboardOrderedDot(x, x))));
  const rhsNorm = norm(rhs), trace = [];
  for (;;) {
    if (iteration < traceCount) trace.push({step: iteration, solution: solution.slice(), p: z.slice(), r: residual.slice(), q: q.slice()});
    const residualNorm = norm(residual);
    if (residualNorm <= rhsNorm * tolerance) return {solution, iterations: iteration, residualNorm, rhsNorm, trace};
    if (iteration >= maxIterations) throw new RangeError('CG did not converge');
    if (iteration > 0) {
      z = residual.slice(); rho = soundboardOrderedDot(z, residual);
      const beta = f(rho / previousRho);
      for (let i = 0; i < direction.length; i++) direction[i] = fma32(beta, direction[i], z[i]);
    }
    previousRho = rho;
    q = multiply(rows, direction);
    const alpha = f(rho / soundboardOrderedDot(direction, q));
    if (!Number.isFinite(alpha)) throw new RangeError('CG numerical breakdown');
    for (let i = 0; i < solution.length; i++) {
      solution[i] = fma32(alpha, direction[i], solution[i]);
      residual[i] = fma32(-alpha, q[i], residual[i]);
    }
    iteration++;
  }
}
