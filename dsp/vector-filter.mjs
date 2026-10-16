/** 6bc124 aligned four-sample filter, including its paired-section FMA order.
 * Coefficient generation and live coefficient smoothing are separate stages.
 */
import { fma32 } from './modal-kernel.mjs';
const f = Math.fround;
const flushThreshold = (() => { const v = new DataView(new ArrayBuffer(4)); v.setUint32(0, 0x219392ef); return v.getFloat32(0); })();
function response(table, offset, history, value, separateInput) {
  const result = new Float32Array(4);
  for (let lane = 0; lane < 4; lane++) {
    let past = f(table[offset + 20 + lane] * history[2]);
    past = fma32(table[offset + 16 + lane], history[3], past);
    past = fma32(table[offset + 24 + lane], history[1], past);
    past = fma32(table[offset + 28 + lane], history[0], past);
    if (separateInput) {
      let next = f(table[offset + 4 + lane] * value[2]);
      next = fma32(table[offset + lane], value[3], next);
      next = fma32(table[offset + 8 + lane], value[1], next);
      next = fma32(table[offset + 12 + lane], value[0], next);
      result[lane] = f(next + past);
    } else {
      past = fma32(table[offset + lane], value[3], past);
      past = fma32(table[offset + 4 + lane], value[2], past);
      past = fma32(table[offset + 8 + lane], value[1], past);
      result[lane] = fma32(table[offset + 12 + lane], value[0], past);
    }
  }
  return result;
}

export function renderVectorFilter(input, table, history) {
  if (input.length % 4 || history.length % 4 || table.length !== history.length * 8) {
    throw new Error('Invalid aligned filter shape');
  }
  const output = Float32Array.from(input);
  const sections = history.length / 4;
  for (let section = 0; section < sections;) {
    const first = section * 4;
    let a = history.slice(first, first + 4);
    const paired = section + 1 < sections;
    let b = paired ? history.slice(first + 4, first + 8) : undefined;
    for (let i = 0; i < output.length; i += 4) {
      const value = output.slice(i, i + 4);
      const next = response(table, section * 32, a, value, true);
      a = Float32Array.of(next[2], next[3], value[2], value[3]);
      if (paired) {
        const final = response(table, (section + 1) * 32, b, next, false);
        b = Float32Array.of(final[2], final[3], next[2], next[3]);
        output.set(final, i);
      } else output.set(next, i);
    }
    history.set(a, first);
    if (paired) history.set(b, first + 4);
    section += paired ? 2 : 1;
  }
  if (sections && Math.abs(output[0]) < flushThreshold) {
    for (let i = 0; i < history.length; i++) {
      if (!(Math.abs(history[i]) > flushThreshold)) history[i] = 0;
    }
  }
  return output;
}

/** 19a3d0 setup: four output rows, then transpose to eight SIMD columns. */
export function buildVectorFilterTable(b0, b1, b2, feedback1, feedback2) {
  const a = f(feedback1), b = f(feedback2);
  const row0 = Float32Array.of(0, 0, 0, b0);
  const hist0 = Float32Array.of(b1, b2, a, b);
  const row1 = Float32Array.of(0, 0, b0, b1);
  const hist1 = Float32Array.of(b2, 0, b, 0);
  for (let i = 0; i < 4; i++) {
    row1[i] = fma32(row0[i], a, row1[i]);
    hist1[i] = fma32(hist0[i], a, hist1[i]);
  }
  const row2 = Float32Array.of(0, b0, b1, b2);
  const hist2 = new Float32Array(4);
  const row3 = Float32Array.of(b0, b1, b2, 0);
  const hist3 = new Float32Array(4);
  for (let i = 0; i < 4; i++) {
    row2[i] = f(row2[i] + fma32(row0[i], b, f(row1[i] * a)));
    hist2[i] = fma32(hist0[i], b, f(hist1[i] * a));
    row3[i] = f(row3[i] + fma32(row1[i], b, f(row2[i] * a)));
    hist3[i] = fma32(hist1[i], b, f(hist2[i] * a));
  }
  const rows = [row0, row1, row2, row3];
  const historyRows = [hist0, hist1, hist2, hist3];
  const table = new Float32Array(32);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      table[c * 4 + r] = rows[r][c];
      table[16 + c * 4 + r] = historyRows[r][c];
    }
  }
  return table;
}
