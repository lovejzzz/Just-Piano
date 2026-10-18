// Output accumulation from FUN_1005ab0e0. A record contributes a pair of
// adjacent samples for each (a,b,c,state-index) entry.
import {fma32} from './modal-kernel.mjs';

const f = Math.fround;

export function applySoundboardOutputKernel(record, stateBlocks, output, blockStart) {
  if (!record || !Number.isInteger(record.offset) || !Array.isArray(record.entries)) {
    throw new RangeError('Valid soundboard output record required');
  }
  if (!(output instanceof Float32Array)) throw new RangeError('Float32 output required');
  if (!Array.isArray(stateBlocks)) throw new RangeError('State block list required');
  const start = blockStart + record.offset;
  if (!Number.isInteger(start) || start < 0) throw new RangeError('Invalid output offset');
  if (start + 64 >= output.length) return output;
  const left = new Float32Array(64);
  const right = new Float32Array(64);
  for (const entry of record.entries) {
    const block = stateBlocks[entry.stateIndex];
    if (!block || block.length < 65) throw new RangeError('State block is too short');
    if (![entry.a, entry.b, entry.c].every(Number.isFinite)) {
      throw new RangeError('Finite kernel coefficients required');
    }
    const oneMinusA = f(1 - entry.a);
    for (let time = 0; time < 64; time++) {
      // 0x1005ab24c/250: round the next-state product before FMLA.
      const value = fma32(entry.c, block[time], f(entry.b * block[time + 1]));
      left[time] = fma32(entry.a, value, left[time]);
      right[time] = fma32(oneMinusA, value, right[time]);
    }
  }
  // ARM64 0x1005ab4d4..550 commits four lanes at a time. At group
  // boundaries the previous right contribution is committed separately.
  for (let time = 0; time < 64; time += 4) {
    output[start + time] = f(left[time] + output[start + time]);
    for (let lane = 1; lane < 4; lane++) {
      const index = start + time + lane;
      output[index] = f(left[time + lane] + f(right[time + lane - 1] + output[index]));
    }
    output[start + time + 4] = f(right[time + 3] + output[start + time + 4]);
  }
  return output;
}
