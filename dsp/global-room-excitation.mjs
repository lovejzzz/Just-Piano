import { fma32 } from './modal-kernel.mjs';
import { neonReciprocalEstimateNormal } from './neon-reciprocal.mjs';

const f = Math.fround, word = new DataView(new ArrayBuffer(8));
word.setUint32(0, 0x219392ef, true); const tiny = word.getFloat32(0, true);
word.setBigUint64(0, 0x3eb0c6f7a0b5ed8dn, true); const rampThreshold = word.getFloat64(0, true);

export class VectorDelay64 {
  constructor(config) {
    if (!Number.isInteger(config.capacity) || config.capacity < 1 || config.capacity > 4096 || config.capacity % 4 || config.width !== 64)
      throw Error('Bound complete 64-sample vector ring required');
    this.capacity = config.capacity; this.width = 64; this.cursor = 0; this.filled = 0;
    this.pages = Array.from({ length: config.capacity / 4 }, () => new Float32Array(256));
    this.empty = this.pages.map(() => true);
  }
  touch(page) { if (this.empty[page]) { this.pages[page].fill(0); this.empty[page] = false; } return this.pages[page]; }
  current() { return this.touch(this.cursor >> 2).subarray((this.cursor & 3) * 64, (this.cursor & 3) * 64 + 64); }
  advance(clear = false) {
    this.cursor = (this.cursor + 1) % this.capacity; this.filled = Math.min(this.capacity, this.filled + 1);
    const output = this.current(); if (clear) output.fill(0); return output;
  }
  read(delay) {
    if (!Number.isInteger(delay) || delay < 0 || delay + 64 > this.capacity * 64) throw Error('Bound scalar delay span required');
    const result = new Float32Array(64), total = this.capacity * 64;
    const first = (this.capacity + this.cursor) * 64 - delay;
    for (let i = 0; i < 64; i++) {
      const index = (first + i) % total;
      result[i] = this.touch(index >> 8)[index & 255];
    }
    return result;
  }
  addTo(target, delay, gain) {
    if (gain === 0) return;
    const source = this.read(delay);
    for (let i = 0; i < 64; i++) target[i] = fma32(source[i], gain, target[i]);
  }
}

function flushConditional(values) {
  if (values[0] !== 0 && Math.abs(values[0]) < tiny)
    for (let i = 0; i < values.length; i++) if (!(Math.abs(values[i]) > tiny)) values[i] = 0;
}

class Fir4 {
  constructor(config) {
    if (!config.blocks || config.coefficients.length !== config.blocks * 4 || !config.coefficients.every(Number.isFinite))
      throw Error('Complete room FIR coefficients required');
    this.blocks = config.blocks; this.coefficients = Float32Array.from(config.coefficients);
    this.history = new Float32Array(config.blocks * 4); this.cursor = 0;
  }
  processInPlace(input) {
    for (let i = 0; i < 64; i += 4) {
      const original = input.slice(i, i + 4), output = new Float32Array(4);
      let value = original;
      for (let block = 0; block < this.blocks; block++) {
        const h = this.history.slice(((this.cursor + block) % this.blocks) * 4, ((this.cursor + block) % this.blocks) * 4 + 4);
        for (let lane = 0; lane < 4; lane++) {
          output[lane] = fma32(value[lane], this.coefficients[block * 4], output[lane]);
          output[lane] = fma32(lane ? value[lane - 1] : h[3], this.coefficients[block * 4 + 1], output[lane]);
          output[lane] = fma32(lane >= 2 ? value[lane - 2] : h[lane + 2], this.coefficients[block * 4 + 2], output[lane]);
          output[lane] = fma32(lane >= 3 ? value[lane - 3] : h[lane + 1], this.coefficients[block * 4 + 3], output[lane]);
        }
        value = h;
      }
      this.cursor = (this.cursor + this.blocks - 1) % this.blocks;
      this.history.set(original, this.cursor * 4); input.set(output, i);
    }
  }
}

export class GlobalRoomExcitation64 {
  constructor(profile) {
    if (profile.channels.length !== 2 || profile.damping.length !== 2) throw Error('Inspected stereo room bank required');
    this.damping = profile.damping.map(c => new VectorDelay64(c));
    this.previousGains = [0, 0];
    this.channels = profile.channels.map(c => {
      if (c.updateCountdown !== 0) throw Error('Changing room coefficients not covered');
      return { config: c, input: new VectorDelay64(c.input), sum: new VectorDelay64(c.sum), output: new VectorDelay64(c.output),
        combs: c.combs.map(x => ({ ...x, ring: new VectorDelay64(x.ring) })),
        allpasses: c.allpasses.map(x => ({ ...x, ring: new VectorDelay64(x.ring) })),
        fir: c.postFilterEnabled ? new Fir4(c.postFir) : null, clock: 0 };
    });
  }
  process64(source, gains) {
    if (source.length !== 64 || !Array.from(source).every(Number.isFinite) || gains.length !== 2 || !gains.every(Number.isFinite))
      throw Error('Complete finite room input and controls required');
    gains.forEach((given, row) => {
      const target = f(Math.min(1, Math.max(0, given))), before = this.previousGains[row], output = this.damping[row].advance();
      if (Math.abs(f(target - before)) < rampThreshold) output.fill(target);
      else {
        const step = f(f(target - before) / 64); let value = before;
        for (let i = 0; i < 64; i++) { output[i] = value; value = f(value + step); }
      }
      this.previousGains[row] = target;
    });
    return this.channels.map(channel => {
      channel.input.advance().set(source); channel.clock += 64;
      const sum = channel.sum.advance(true);
      for (const comb of channel.combs) {
        const current = comb.ring.advance(), input = channel.input.read(comb.delay), g0 = this.damping[0].read(comb.delay);
        const feedback = this.damping[1].read(comb.delay);
        const denominatorBase = f(1 - comb.damping), factor = f(comb.damping * f(2 - comb.damping));
        for (let i = 0; i < 64; i++) {
          current[i] = f(input[i] * g0[i]);
          const denominator = f(denominatorBase + feedback[i]), numerator = f(feedback[i] * factor);
          let reciprocal = neonReciprocalEstimateNormal(denominator);
          reciprocal = f(reciprocal * fma32(-denominator, reciprocal, 2));
          reciprocal = f(reciprocal * fma32(-denominator, reciprocal, 2));
          feedback[i] = f(numerator * reciprocal);
        }
        const history = comb.ring.read(comb.delay);
        for (let i = 0; i < 64; i++) { feedback[i] = f(feedback[i] * history[i]); current[i] = f(current[i] + feedback[i]); }
        flushConditional(current); comb.ring.addTo(sum, 0, comb.mix);
      }
      if (channel.fir) channel.fir.processInPlace(sum);
      let previous = channel.sum;
      for (const allpass of channel.allpasses) {
        const current = allpass.ring.advance(); current.set(previous.read(allpass.delay));
        previous.addTo(current, 0, -allpass.gain); allpass.ring.addTo(current, allpass.delay, allpass.gain);
        flushConditional(current); previous = allpass.ring;
      }
      const output = channel.output.advance(); output.set(previous.read(channel.config.outputDelay));
      return Float32Array.from(output, x => Math.abs(x) > tiny ? f(x + 0) : 0);
    });
  }
}
