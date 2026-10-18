import { fma32 } from './modal-kernel.mjs';

// Scalar delay lattice, with float32 multiply followed by fused updates.
// Configuration is static; ring history is owned and never restored per block.
export class ScalarAllpass {
  constructor({ length, write = 0, read = 0, taps }) {
    if (!Number.isInteger(length) || length < 1 || length > 8192 || (length & (length - 1))) throw Error('Invalid scalar ring length');
    if (![write, read].every(x => Number.isInteger(x) && x >= 0 && x <= 0xffffffff)) throw Error('Invalid scalar cursor');
    if (!Array.isArray(taps) || taps.length > 32) throw Error('Invalid scalar taps');
    this.taps = taps.map(t => {
      if (![t.start, t.end].every(x => Number.isInteger(x) && x >= 0 && x <= 0xffffffff) || ![t.c, t.g].every(Number.isFinite)) throw Error('Invalid scalar tap');
      return { start: t.start, end: t.end, c: Math.fround(t.c), g: Math.fround(t.g) };
    });
    this.ring = new Float32Array(length);
    this.mask = length - 1;
    this.write = write;
    this.read = read;
  }

  process(input) {
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      this.ring[this.write & this.mask] = input[i];
      for (const t of this.taps) {
        const ia = (this.write - t.start) & this.mask;
        const ib = (this.write - t.end) & this.mask;
        const a = this.ring[ia], b = this.ring[ib];
        this.ring[ia] = fma32(b, t.c, Math.fround(a * t.g));
        this.ring[ib] = fma32(-a, t.c, b);
      }
      this.write = (this.write + 1) >>> 0;
      output[i] = this.ring[this.read & this.mask];
      this.read = (this.read + 1) >>> 0;
    }
    return output;
  }
}
