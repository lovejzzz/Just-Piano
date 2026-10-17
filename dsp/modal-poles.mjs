// Arithmetic recovered from 476298 / 6d2c10. Root iteration is an independent
// Durand–Kerner implementation, NOT the native 484ce4 eigensolver.
import {fma64} from './native-double-fma.mjs';
export {fma64} from './native-double-fma.mjs';
import {solveNativeQuadratic} from './native-small-eigen.mjs';
import {singleComponentPole} from './single-component-pole.mjs';
function multiplyLinear(a, [constant, slope]) {
  const result = Array(a.length + 1).fill(0);
  // 476748 and 476768: ascending source index, two separate FMADDs.
  // Accumulate constant after the preceding source's slope contribution.
  for (let i = 0; i < a.length; i++) {
    result[i] = fma64(constant, a[i], result[i]);
    result[i + 1] = fma64(slope, a[i], result[i + 1]);
  }
  return result;
}
export function buildCoupledCoefficients(lambda, { p, q, mode, kappa = Math.PI, gamma = 0 }) {
  const n = lambda.length;
  if (n < 2) throw new RangeError('Polynomial construction requires N >= 2; use coupledModes for N = 1');
  if (![...lambda, p, q, mode, kappa, gamma].every(Number.isFinite)) throw new RangeError('Non-finite pole input');
  const mean = lambda.reduce((a, b) => a + b, 0) / n;
  if (!mean) throw new RangeError('Zero lambda mean');
  const delta = lambda.map(value => value / mean - 1);
  const beta = delta.map(value => ((1 - value) * 0.5) / mean);
  const factors = beta.map((value, j) => [value, -kappa * mode * delta[j]]);
  const sum = Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    let product = [1];
    for (let k = 0; k < n; k++) if (k !== j) product = multiplyLinear(product, factors[k]);
    for (let k = 0; k < n; k++) sum[k] += product[k];
  }
  let product = [1];
  for (let j = 0; j < n - 1; j++) product = multiplyLinear(product, factors[j]);
  // The native last factor really uses beta[N-2], not beta[N-1].
  product = multiplyLinear(product, [beta[n - 2], factors[n - 1][1]]);
  const coefficients = product.flatMap((value, j) => [fma64(-p, value, 0), fma64(-q, value, j ? sum[j - 1] : gamma)]);
  return { coefficients, mean, delta, beta, sum, product };
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const norm = a => Math.hypot(...a);
function div(a, b) {
  // Scaled division avoids squaring large or tiny denominator components.
  const scale = Math.max(Math.abs(b[0]), Math.abs(b[1]));
  if (!scale) throw new RangeError('Zero complex divisor');
  const re = b[0] / scale, im = b[1] / scale, denominator = re * re + im * im;
  return [(a[0] / scale * re + a[1] / scale * im) / denominator,
    (a[1] / scale * re - a[0] / scale * im) / denominator];
}
function evaluate(coefficients, z) {
  let result = coefficients[0];
  for (let k = 1; k < coefficients.length; k++) result = add(mul(result, z), coefficients[k]);
  return result;
}
export function polynomialResidual(coefficientsInterleaved, root) {
  const coefficients = pairs(coefficientsInterleaved), radius = norm(root);
  let scale = norm(coefficients[0]);
  for (let k = 1; k < coefficients.length; k++) scale = scale * radius + norm(coefficients[k]);
  return norm(evaluate(coefficients, root)) / Math.max(scale, Number.MIN_VALUE);
}
function pairs(values) {
  if (values.length % 2 || !values.every(Number.isFinite)) throw new RangeError('Expected finite interleaved complex coefficients');
  return Array.from({ length: values.length / 2 }, (_, j) => values.slice(2 * j, 2 * j + 2));
}
export function solveCoupledPolynomial(coefficientsInterleaved, { maxIterations = 256 } = {}) {
  const original = pairs(coefficientsInterleaved), n = original.length - 1;
  // Explicitly reject unvalidated native zero-trimming / high-degree branches.
  if (n < 2 || n > 3) throw new RangeError('Independent root solver currently supports only degree 2 or 3');
  if (!norm(original[0]) || !norm(original[n])) throw new RangeError('Native zero-coefficient trimming is not implemented');
  const coefficients = original.map(value => div(value, original[0]));
  const radius = 1 + Math.max(...coefficients.slice(1).map(norm));
  let roots = Array.from({ length: n }, (_, j) => {
    const angle = 2 * Math.PI * (j + 0.271828) / n;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
  let iterations = 0, maxStep = Infinity;
  for (; iterations < maxIterations; iterations++) {
    maxStep = 0;
    const next = roots.map((root, j) => {
      let denominator = [1, 0];
      for (let k = 0; k < n; k++) if (k !== j) denominator = mul(denominator, sub(root, roots[k]));
      const step = div(evaluate(coefficients, root), denominator);
      maxStep = Math.max(maxStep, norm(step));
      return sub(root, step);
    });
    roots = next;
    if (maxStep <= 2e-16 * Math.max(1, ...roots.map(norm))) { iterations++; break; }
  }
  const residuals = roots.map(root => polynomialResidual(coefficientsInterleaved, root));
  const converged = Math.max(...residuals) <= 2e-14;
  if (!converged) throw new Error(`Independent root solver did not converge: residual ${Math.max(...residuals)}`);
  return { roots: roots.flat(), iterations, residuals, algorithm: 'independent-durand-kerner' };
}
export function rootsToFrequencyDecay(rootsInterleaved, center, floorRatio) {
  if (!Number.isFinite(center) || !Number.isFinite(floorRatio) || floorRatio <= 0) throw new RangeError('Invalid center/floor ratio');
  const roots = pairs(rootsInterleaved);
  const frequencyDouble = roots.map(([re]) => Math.abs(((center + center) * Math.PI + re) / (2 * Math.PI)));
  const keys = roots.map((root, j) => fma64(frequencyDouble[j], 1e-16, root[1]));
  const order = roots.map((_, j) => j).sort((a, b) => keys[b] - keys[a]);
  if (new Set(keys).size !== keys.length) throw new RangeError('Equal native sort keys are not validated');
  const floor = roots[order[0]][1] / floorRatio;
  return {
    frequency: order.map(j => Math.fround(frequencyDouble[j])),
    decay: order.map(j => Math.fround(Math.max(roots[j][1], floor))),
    order, keys, floor,
  };
}
export function coupledModes(lambda, parameters) {
  if (lambda.length === 1) return singleComponentPole(parameters);
  const built = buildCoupledCoefficients(lambda, parameters);
  const algorithm=parameters.rootAlgorithm??'independent-durand-kerner';
  if(!['independent-durand-kerner','native-quadratic-block'].includes(algorithm))throw new RangeError('Unknown pole root algorithm');
  const solved = algorithm==='native-quadratic-block'
    ? solveNativeQuadratic(built.coefficients,{tolerance:parameters.rootTolerance})
    : solveCoupledPolynomial(built.coefficients);
  return { ...rootsToFrequencyDecay(solved.roots, parameters.center, parameters.decay_floor_ratio), ...built, solver: solved };
}
