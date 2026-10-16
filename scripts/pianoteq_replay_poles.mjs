#!/usr/bin/env node
// Replay authentic runtime captures without loading any Pianoteq binary.
import fs from 'node:fs';
import { buildCoupledCoefficients, solveCoupledPolynomial, rootsToFrequencyDecay } from '../dsp/modal-poles.mjs';
const [coefficientPath, rootsPath, outputPath] = process.argv.slice(2);
if (!coefficientPath || !rootsPath) {
  console.error('Usage: node scripts/pianoteq_replay_poles.mjs attempt4-runtime.json runtime.json [report.json]');
  process.exit(2);
}
const coefficientRecords = JSON.parse(fs.readFileSync(coefficientPath, 'utf8')).records;
const rootRecords = JSON.parse(fs.readFileSync(rootsPath, 'utf8')).records;
if (!Array.isArray(coefficientRecords) || !coefficientRecords.length || !Array.isArray(rootRecords) || !rootRecords.length) {
  console.error('Both captures must contain nonempty records arrays');
  process.exit(2);
}
const failures = [], coefficientChecks = [], rootChecks = [];
function exact(a, b) { return Object.is(a, b); }
function matchRoots(predicted, observed) {
  const n = observed.length / 2;
  let best = { error: Infinity, permutation: [] };
  function search(order) {
    if (order.length === n) {
      const errors = order.map((j, k) => Math.hypot(predicted[2 * j] - observed[2 * k], predicted[2 * j + 1] - observed[2 * k + 1]));
      const error = Math.max(...errors);
      if (error < best.error) best = { error, permutation: order.slice(), errors };
      return;
    }
    for (let j = 0; j < n; j++) if (!order.includes(j)) search([...order, j]);
  }
  search([]);
  return best;
}
for (const [index, record] of coefficientRecords.entries()) {
  try {
    const prediction = buildCoupledCoefficients(record.lambda, { ...record.parameters, kappa: record.kappa, gamma: record.gamma });
    const actual = record.complex_coefficients_interleaved;
    const errors = actual.map((value, j) => Math.abs(value - prediction.coefficients[j]));
    const exactCount = actual.filter((value, j) => exact(value, prediction.coefficients[j])).length;
    const passed = exactCount === actual.length;
    coefficientChecks.push({ index, count: actual.length, exactCount, maximumAbsoluteError: Math.max(...errors), passed, errors });
    if (!passed) failures.push({ stage: 'coefficients', index, errors });
  } catch (error) { failures.push({ stage: 'coefficients', index, error: error.message }); }
}
for (const [index, record] of rootRecords.entries()) {
  try {
    const solved = solveCoupledPolynomial(record.coefficients);
    const matching = matchRoots(solved.roots, record.roots);
    const replay = rootsToFrequencyDecay(record.roots, record.center, record.floor_ratio);
    const independent = rootsToFrequencyDecay(solved.roots, record.center, record.floor_ratio);
    const replayExactCount = [...replay.frequency, ...replay.decay].filter((value, j) => exact(value, [...record.frequency, ...record.decay][j])).length;
    const independentExactCount = [...independent.frequency, ...independent.decay].filter((value, j) => exact(value, [...record.frequency, ...record.decay][j])).length;
    const orderEqual = replay.order.every((value, j) => value === record.sort_indices[j]);
    const passed = matching.error <= 1e-12 && replayExactCount === 2 * record.N && independentExactCount === 2 * record.N && orderEqual;
    rootChecks.push({ index, N: record.N, matching, replayExactCount, independentExactCount, orderEqual, residuals: solved.residuals, iterations: solved.iterations, passed });
    if (!passed) failures.push({ stage: 'roots', index, replay, independent, observedFrequency: record.frequency, observedDecay: record.decay, matching });
  } catch (error) { failures.push({ stage: 'roots', index, error: error.message }); }
}
const result = {
  algorithm: 'independent Durand–Kerner; not native eigensolver reproduction',
  sources: { coefficientPath, rootsPath },
  coefficientChecks, rootChecks, failures,
  summary: {
    coefficientRecords: coefficientChecks.length,
    coefficientExactCount: coefficientChecks.reduce((n, row) => n + row.exactCount, 0),
    coefficientCount: coefficientChecks.reduce((n, row) => n + row.count, 0),
    rootRecords: rootChecks.length,
    componentCount: rootChecks.reduce((n, row) => n + row.N, 0),
    replayExactCount: rootChecks.reduce((n, row) => n + row.replayExactCount, 0),
    independentExactCount: rootChecks.reduce((n, row) => n + row.independentExactCount, 0),
    maximumRootError: Math.max(...rootChecks.map(row => row.matching.error)),
    maximumResidual: Math.max(...rootChecks.flatMap(row => row.residuals)),
    failures: failures.length,
  },
};
if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.summary, null, 2));
if (failures.length) process.exitCode = 1;
