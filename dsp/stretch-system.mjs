// 326fe0: weighted finite differences, constrained log-frequency system and
// table finishing. The stiffness-dependent RHS producer is still external.
import { stretchGram, stretchScale, stretchAddScaled } from './stretch-linear.mjs';

export function stretchSines(math) {
  if (typeof math?.sin !== 'function') throw new TypeError('Explicit native sin dependency required');
  const values = Float64Array.from({ length: 107 }, (_, i) =>
    i === 106 ? 1.2246467991473532e-16 : math.sin(((i + 1) * Math.PI) / 107));
  return values;
}

export function buildStretchMatrix({ interval, sines, middleWeight, gramScale }) {
  if (!Number.isInteger(interval) || interval < 1 || interval > 106 ||
      sines.length !== 107 || !Array.from(sines).every(Number.isFinite) || !Number.isFinite(gramScale))
    throw new RangeError('Supported interval, finite 107 sines and scale required');
  const weight = Number.isFinite(middleWeight) && Math.abs(middleWeight) <= 10000 ? middleWeight : 0;
  const d2 = { rows: 105, columns: 107, values: new Float64Array(105 * 107), layout: 'column-major' };
  const d3 = { rows: 104, columns: 107, values: new Float64Array(104 * 107), layout: 'column-major' };
  for (let r = 0; r < 105; r++) {
    const s = sines[r];
    d2.values[r * 105 + r] = -s;
    d2.values[(r + 1) * 105 + r] = weight * s;
    d2.values[(r + 2) * 105 + r] = -s;
  }
  for (let r = 0; r < 104; r++) {
    const s = sines[r];
    d3.values[r * 104 + r] = s;
    d3.values[(r + 1) * 104 + r] = s * -3;
    d3.values[(r + 2) * 104 + r] = s * 3;
    d3.values[(r + 3) * 104 + r] = -s;
  }
  const gram = stretchAddScaled(stretchScale(stretchGram(d2), gramScale), stretchGram(d3), 100);
  const n = 215 - interval, values = new Float64Array(n * n);
  for (let c = 0; c < 107; c++) for (let r = 0; r < 107; r++) values[c * n + r] = gram.values[c * 107 + r];
  values[107 * n + 61] = 1;
  values[61 * n + 107] = 1;
  for (let r = 0; r < 107 - interval; r++) {
    const constraint = 108 + r;
    values[constraint * n + r] = -1;
    values[r * n + constraint] = -1;
    values[constraint * n + r + interval] = 1;
    values[(r + interval) * n + constraint] = 1;
  }
  return { rows: n, columns: n, values, layout: 'column-major' };
}

export function stretchTableFromLogSolution(solution, math) {
  if (solution.length < 107 || !Array.from(solution).every(Number.isFinite))
    throw new RangeError('Finite log-frequency solution required');
  if (typeof math?.exp2 !== 'function' || typeof math?.pow !== 'function')
    throw new TypeError('Explicit native exp2 and pow dependencies required');
  const table = new Float32Array(128);
  for (let n = 8; n <= 114; n++) table[n] = math.exp2(solution[n - 8]);
  const lowRatio = Math.fround(table[9] / table[8]);
  for (let n = 0; n < 8; n++) table[n] = math.pow(lowRatio, n - 8) * table[8];
  const highRatio = Math.fround(table[114] / table[113]);
  for (let n = 115; n < 128; n++) table[n] = math.pow(highRatio, n - 114) * table[114];
  return table;
}
