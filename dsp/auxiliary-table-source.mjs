// 301c8c -> 0b76f0: absolute-age source tables and packed four-sample filters.
import {fma32} from './modal-kernel.mjs';
const f = Math.fround, view = new DataView(new ArrayBuffer(4));
function fromWord(word) { view.setUint32(0, word, true); return view.getFloat32(0, true); }
const beforeThreshold = fromWord(0x219392ef), filterThreshold = fromWord(0x2edbe6ff);
export class AuxiliaryTableSource64 {
  constructor(profile, tables) {
    if (!Number.isInteger(profile.delay) || profile.delay < 0 || profile.delay % 4 ||
        profile.gain?.length !== 2 || !profile.gain.every(Number.isFinite) ||
        !tables.has(profile.primary) || profile.secondary && !tables.has(profile.secondary) ||
        profile.filters?.length > 5) throw Error('Supported aligned auxiliary source profile required');
    this.delay = profile.delay; this.gain = profile.gain.slice();
    this.primary = Float32Array.from(tables.get(profile.primary));
    this.secondary = profile.secondary ? Float32Array.from(tables.get(profile.secondary)) : null;
    this.filters = profile.filters.map(words => {
      if (words.length !== 36 || words.slice(0, 4).some(x => x !== 0)) throw Error('Cold auxiliary filter required');
      const values = Float32Array.from(words, fromWord);
      if (!values.every(Number.isFinite)) throw Error('Finite auxiliary filter required');
      return {coefficients: values.slice(4), history: new Float32Array(4)};
    });
    this.age = 0; this.started = false; this.pastFirstThird = false;
  }
  process64() {
    const output = new Float32Array(64), age = this.age; this.age += 64;
    if (age + 64 <= this.delay) return output;
    const prefix = Math.max(0, this.delay - age), position = Math.max(0, age - this.delay);
    this.started = true; this.pastFirstThird = position >= Math.floor(this.primary.length / 3);
    if (position >= this.primary.length) return output;
    const count = Math.min(64 - prefix, this.primary.length - position);
    const secondaryCount = this.secondary ? Math.max(0, Math.min(count, this.secondary.length - position)) : 0;
    if (count % 4 || secondaryCount % 4 || position % 4) throw Error('Aligned auxiliary source extent required');
    const bulk = Math.floor(secondaryCount / 16) * 16;
    for (let i = 0; i < count; i++) {
      const a = this.primary[position + i], b = this.secondary?.[position + i];
      output[prefix + i] = i >= secondaryCount ? f(a * this.gain[0]) :
        i < bulk ? fma32(b, this.gain[1], f(a * this.gain[0])) : fma32(a, this.gain[0], f(b * this.gain[1]));
    }
    for (const state of this.filters)
      state.history = Float32Array.from(state.history, x => Math.abs(x) > beforeThreshold ? x : 0);
    for (const state of this.filters) {
      let h = Float32Array.from(state.history, x => Math.abs(x) > filterThreshold ? x : 0);
      const c = state.coefficients;
      for (let i = prefix; i < prefix + count; i += 4) {
        const x = output.slice(i, i + 4), y = new Float32Array(4);
        for (let lane = 0; lane < 4; lane++) {
          let feedback = f(c[20 + lane] * h[2]);
          feedback = fma32(c[16 + lane], h[3], feedback);
          feedback = fma32(c[24 + lane], h[1], feedback);
          feedback = fma32(c[28 + lane], h[0], feedback);
          let feed = f(c[4 + lane] * x[2]);
          feed = fma32(c[lane], x[3], feed);
          feed = fma32(c[8 + lane], x[1], feed);
          feed = fma32(c[12 + lane], x[0], feed);
          y[lane] = f(feed + feedback);
        }
        output.set(y, i); h = Float32Array.of(y[2], y[3], x[2], x[3]);
      }
      state.history = h;
    }
    return output;
  }
}
