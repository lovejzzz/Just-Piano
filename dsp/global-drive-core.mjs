import { fma32 } from './modal-kernel.mjs';
import { nativeScalarPowf } from './native-scalar-pow.mjs';

const f = Math.fround;
const word = new DataView(new ArrayBuffer(8));
const doubleWord = x => { word.setBigUint64(0, BigInt('0x' + x), true); return word.getFloat64(0, true); };
const smallDifference = doubleWord('3bc79ca10c924223');
const smallHistory = doubleWord('3c9cd2b297d889bc');
const relativeFloor = doubleWord('3eb0c6f7a0b5ed8d');
word.setUint32(0, 0x358637bd, true);
const outputFloor = word.getFloat32(0, true);
const dynamic = [0x28, 0x2c, 0x3c, 0x40, 0x50, 0x54, 0x64, 0x68];
export const DRIVE_DYNAMIC_OFFSETS = Object.freeze([...dynamic]);
export const DRIVE_STATIC_OFFSETS = Object.freeze([0x14, 0x1c, 0x20, 0x24, 0x30, 0x34, 0x38, 0x44, 0x48, 0x4c, 0x58, 0x5c, 0x60, 0xa0, 0xd0, 0xf4, 0xf8, 0xfc, 0x100, 0x104, 0x108]);

// 829d48 nonlinear generator, before the separately controlled 12a100 filter.
// The immutable profile/window and level/gain controls remain external inputs.
export class GlobalDriveCore64 {
  constructor(config) {
    if (config.stateWords?.length !== 68 || !Array.isArray(config.window) || config.window.some(x => !Number.isFinite(x))) throw Error('Complete drive profile required');
    this.words = Uint32Array.from(config.stateWords);
    this.view = new DataView(this.words.buffer);
    if (this.words[0xa0 / 4] !== config.window.length || !this.words[0xd0 / 4] || this.words[0xd0 / 4] >= config.window.length ||
        dynamic.some(offset => !Object.is(this.get(offset), 0)) || config.initial.previousLevel !== -1 || config.initial.peak !== 0 ||
        config.initial.cursor !== 0 || config.initial.reset !== 1 || config.initial.direction !== 0)
      throw Error('Verified cold drive profile required');
    for (const offset of dynamic) this.set(offset, 0);
    this.window = Float32Array.from(config.window);
    this.previousLevel = -1; this.peak = 0; this.cursor = 0; this.direction = 0; this.reset = true;
    this.historyResets = 0; this.powCalls = 0;
  }
  get(offset) { return this.view.getFloat32(offset, true); }
  set(offset, value) { this.view.setFloat32(offset, value, true); }
  steady(level) { return f(f(level * f(this.get(0x1c) + this.get(0x20))) / f(this.get(0x24) + 1)); }
  process64(level, gain) {
    if (![level, gain].every(Number.isFinite)) throw Error('Finite drive control required');
    level = f(level); gain = f(gain);
    const output = new Float32Array(64), resetSamples = [];
    this.peak = 0;
    if (this.get(0x14) === 0) return { output, resetSamples };
    if (this.reset) { this.set(0x28, this.steady(level)); this.set(0x2c, level); }
    if (level > this.previousLevel && this.direction === -1) this.cursor = 0;
    if (level !== this.previousLevel) this.direction = level > this.previousLevel ? 1 : -1;
    this.previousLevel = level; this.reset = false;
    let shape = fma32(f(gain + gain), this.get(0x100), this.get(0xf4));
    if (shape > 0) shape = f(shape + Math.max(this.get(0xf8), 0));
    const exponent = Math.max(f(0.1), f(1 - f(shape / this.get(0xfc))));
    const relative = level * relativeFloor;
    for (let i = 0; i < 64; i++) {
      const t = fma32(level, this.get(0x20), f(this.get(0x1c) * this.get(0x2c)));
      const previous = f(this.get(0x24) * this.get(0x28));
      let difference = f(t - previous);
      const absolute = Math.abs(difference);
      this.set(0x2c, level);
      if (i === 0 && difference !== 0 && absolute < smallDifference) difference = this.steady(level);
      this.set(0x28, difference);
      let x = absolute, y1 = this.get(0x3c), x1 = this.get(0x40), y2 = this.get(0x50), x2 = this.get(0x54);
      if (relative > absolute) {
        x = 0;
        if (i === 0) {
          if (f(Math.abs(y1) + Math.abs(x1)) < smallHistory) { y1 = 0; x1 = 0; }
          if (f(Math.abs(y2) + Math.abs(x2)) < smallHistory) { y2 = 0; x2 = 0; }
        }
      }
      y1 = fma32(-this.get(0x38), y1, fma32(x, this.get(0x34), f(this.get(0x30) * x1)));
      this.set(0x3c, y1); this.set(0x40, x);
      y2 = fma32(-this.get(0x4c), y2, fma32(y1, this.get(0x48), f(this.get(0x44) * x2)));
      this.set(0x50, y2); this.set(0x54, y1);
      if (y2 < 0) throw Error('Negative drive intermediate');
      let value = y2;
      if (shape > 0) {
        if (value !== 0) { value = f(this.get(0x104) * nativeScalarPowf(f(value * this.get(0x108)), exponent)); this.powCalls++; }
        const filtered = fma32(-this.get(0x60), this.get(0x64), fma32(value, this.get(0x5c), f(this.get(0x58) * this.get(0x68))));
        this.set(0x68, value); this.set(0x64, filtered); value = filtered;
      }
      if (value > outputFloor) {
        this.peak = Math.max(this.peak, value);
        const cursor = this.cursor < this.window.length ? this.cursor : this.words[0xd0 / 4];
        this.cursor = (cursor + 1) >>> 0;
        output[i] = f(f(value * this.window[cursor]) * this.get(0x14));
      } else if (this.cursor !== 0) {
        this.set(0x28, this.steady(level)); this.set(0x2c, level);
        for (const offset of [0x3c, 0x40, 0x50, 0x54, 0x64, 0x68]) this.set(offset, 0);
        this.cursor = 0; this.historyResets++; resetSamples.push(i);
      }
    }
    return { output, resetSamples };
  }
}
