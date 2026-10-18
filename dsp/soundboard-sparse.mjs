// Sparse row storage recovered from SoundboardIRCompute's +0xa0/+0xc0
// matrices. Each native entry is (uint64 index, float32 coefficient, padding).
import {fma32} from './modal-kernel.mjs';

const f = Math.fround;

export function normalizeSoundboardRows(rows, stateLength) {
  if (!Number.isInteger(stateLength) || stateLength <= 0) {
    throw new RangeError('Positive state length required');
  }
  if (!Array.isArray(rows) || rows.length !== stateLength) {
    throw new RangeError('Sparse row count must equal state length');
  }
  return rows.map((row, rowIndex) => {
    if (!row || row.row !== rowIndex || !Array.isArray(row.entries)) {
      throw new RangeError(`Invalid sparse row ${rowIndex}`);
    }
    const seen = new Set();
    return row.entries.map((entry) => {
      const index = entry.indexLow ?? entry.index;
      const value = entry.valueLow ?? entry.value;
      if (!Number.isInteger(index) || index < 0 || index >= stateLength) {
        throw new RangeError(`Row ${rowIndex} column out of range`);
      }
      if (entry.indexHigh !== undefined && entry.indexHigh !== 0) {
        throw new RangeError(`Row ${rowIndex} has unsupported high index bits`);
      }
      if (!Number.isFinite(value)) throw new RangeError(`Row ${rowIndex} coefficient is not finite`);
      if (seen.has(index)) throw new RangeError(`Row ${rowIndex} has duplicate column ${index}`);
      seen.add(index);
      return Object.freeze({index, value});
    });
  });
}

export function soundboardSparseMultiply(rows, vector) {
  if (!(vector instanceof Float32Array) || vector.some((value) => !Number.isFinite(value))) {
    throw new RangeError('Finite float32 state vector required');
  }
  if (rows.length !== vector.length) throw new RangeError('Sparse row/vector width differs');
  const result = new Float32Array(vector.length);
  for (let row = 0; row < rows.length; row++) {
    let sum = 0;
    for (const entry of rows[row]) sum = fma32(entry.value, vector[entry.index], sum);
    result[row] = sum;
  }
  return result;
}

export function soundboardSparseDifference(rows, current, previous) {
  if (![current, previous].every((vector) =>
    vector instanceof Float32Array && vector.length === rows.length &&
    vector.every(Number.isFinite))) {
    throw new RangeError('Aligned finite float32 vectors required');
  }
  const delta = Float32Array.from(current, (value, index) => f(value - previous[index]));
  return soundboardSparseMultiply(rows, delta);
}
