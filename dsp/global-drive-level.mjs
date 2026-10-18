import { fma32 } from './modal-kernel.mjs';
const f = Math.fround;

// 195200: per-key crossing timer followed by weighted position change.
// Weights are static profile input; key motion is supplied by its own producer.
export class GlobalDriveLevel {
  constructor({ weights, sampleRate, blockSize = 64, enabledGain, initialReset = 0 }) {
    if (!Array.isArray(weights) || !weights.length || weights.length > 128 || !weights.every(Number.isFinite) ||
        !Number.isFinite(sampleRate) || sampleRate <= 0 || blockSize !== 64 || !Number.isFinite(enabledGain) || ![0, 1].includes(initialReset))
      throw Error('Finite complete drive sensor profile required');
    this.weights = Float32Array.from(weights);
    this.timeStep = f(f(blockSize) / f(sampleRate));
    this.enabledGain = f(enabledGain); this.reset = initialReset === 1;
    this.timers = new Float32Array(weights.length); this.previous = new Float32Array(weights.length);
    this.crossings = 0; this.expiries = 0;
  }
  process(values, cap) {
    if (values.length !== this.weights.length || !values.every(Number.isFinite) || !Number.isFinite(cap)) throw Error('Complete sensor key values required');
    if (this.enabledGain === 0) return 0;
    cap = f(cap);
    if (this.reset) {
      values.forEach((x, i) => { this.timers[i] = 0; this.previous[i] = Math.max(cap, f(x)); });
      this.reset = false; return 0;
    }
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      const current = Math.max(cap, f(values[i])), previous = this.previous[i];
      if (this.timers[i] === 0) {
        if (previous <= 0.25 && current > 0.25 || previous >= 0.25 && current < 0.25) {
          this.timers[i] = f(0.025); this.crossings++;
        } else this.previous[i] = current;
      } else {
        const timer = f(this.timers[i] - this.timeStep);
        if (timer > 0) this.timers[i] = timer;
        else {
          this.timers[i] = 0;
          sum = fma32(this.weights[i], Math.abs(f(current - previous)), sum);
          this.previous[i] = current; this.expiries++;
        }
      }
    }
    return sum === 0 ? 0 : -Math.abs(sum);
  }
}
