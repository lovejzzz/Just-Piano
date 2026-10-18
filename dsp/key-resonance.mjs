import { fma32 } from './modal-kernel.mjs';

const f = Math.fround, constants = new DataView(new ArrayBuffer(8));
constants.setUint32(0, 0x358637bd, true);
const sleepThreshold = constants.getFloat32(0, true);
constants.setBigUint64(0, 0x3e45798ee2308c3an, true);
const pairThreshold = constants.getFloat64(0, true);

// 5f1e58: per-key modal subtraction, with independent histories and sleep state.
// Coefficient/control production remains external to this recurrence.
export class KeyResonance64 {
  constructor(config) {
    const { modeCount, stateFloats, sleeping, previousInput, stateAllPositiveZero } = config;
    if (!Number.isInteger(modeCount) || modeCount < 0 || modeCount > 2048 || !Number.isInteger(stateFloats) ||
        stateFloats < modeCount * 2 || stateFloats > 4096 || stateFloats % 4 ||
        ![0, 1].includes(sleeping) || !Object.is(previousInput, 0) || stateAllPositiveZero !== true)
      throw Error('Verified zero initial key modal histories required');
    this.modeCount = modeCount;
    this.states = new Float32Array(stateFloats);
    this.previousInput = 0;
    this.sleeping = sleeping;
    this.wakes = 0; this.sleeps = 0; this.pairCleanups = 0;
  }

  process64(input, coefficients, gain, before) {
    if (input !== null && (input.length !== 64 || !Array.from(input).every(Number.isFinite)) ||
        before.length !== 64 || !Array.from(before).every(Number.isFinite) || !Number.isFinite(gain) ||
        coefficients.length !== this.modeCount || coefficients.some(c => ![c.b, c.a, c.c, c.d].every(Number.isFinite)))
      throw Error('Complete finite key recurrence inputs required');
    const output = Float32Array.from(before);
    if (!this.modeCount || gain === 0) return output;
    if (input === null) {
      if (this.sleeping) return output;
      if (this.states.every(x => Math.abs(x) < sleepThreshold)) {
        this.sleeping = 1; this.sleeps++; return output;
      }
    } else if (this.sleeping) {
      this.states.fill(0); this.wakes++;
    }
    this.sleeping = 0;
    for (let batch = 0; batch < this.modeCount; batch += 4) {
      const lanes = Math.min(4, this.modeCount - batch);
      const old = new Float32Array(4), older = new Float32Array(4);
      const b = new Float32Array(4), a = new Float32Array(4), c = new Float32Array(4), d = new Float32Array(4);
      for (let lane = 0; lane < lanes; lane++) {
        const mode = batch + lane, co = coefficients[mode];
        b[lane] = f(gain * co.b); a[lane] = f(gain * co.a); c[lane] = -co.c; d[lane] = -co.d;
        old[lane] = this.states[2 * mode]; older[lane] = this.states[2 * mode + 1];
        if (f(Math.abs(old[lane]) + Math.abs(older[lane])) < pairThreshold) {
          old[lane] = older[lane] = 0; this.pairCleanups++;
        }
      }
      for (let i = 0; i < 64; i++) {
        const values = new Float32Array(4);
        for (let lane = 0; lane < lanes; lane++) {
          let y;
          if (input !== null) {
            y = f(b[lane] * input[i]);
            y = fma32(a[lane], i ? input[i - 1] : this.previousInput, y);
            y = fma32(c[lane], old[lane], y);
            y = fma32(d[lane], older[lane], y);
          } else if (i % 4 === 0) {
            y = fma32(c[lane], old[lane], f(d[lane] * older[lane]));
          } else {
            y = fma32(d[lane], older[lane], f(c[lane] * old[lane]));
          }
          values[lane] = y; older[lane] = old[lane]; old[lane] = y;
        }
        const sum = f(f(values[0] + values[2]) + f(values[1] + values[3]));
        output[i] = f(output[i] - sum);
      }
      for (let lane = 0; lane < lanes; lane++) {
        this.states[2 * (batch + lane)] = old[lane]; this.states[2 * (batch + lane) + 1] = older[lane];
      }
    }
    this.previousInput = input === null ? 0 : f(input[63]);
    return output;
  }
}
