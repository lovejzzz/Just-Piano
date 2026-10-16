const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const context = {
  sampleRate: 48000,
  AudioWorkletProcessor: class {
    constructor() {
      this.port = {};
    }
  },
  registerProcessor: (_, c) => (context.Processor = c),
  Math,
  Float64Array,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("piano-worklet.js", "utf8"), context);
vm.runInContext(
  fs.readFileSync("presets.js", "utf8") + ";globalThis.presets=PIANO_PRESETS;",
  context,
);
function render(p, seconds) {
  let sum = 0,
    peak = 0;
  for (let block = 0; block < Math.ceil((seconds * 48000) / 128); block++) {
    const L = new Float32Array(128),
      R = new Float32Array(128);
    p.process([], [[L, R]]);
    for (let i = 0; i < 128; i++) {
      assert(Number.isFinite(L[i]) && Number.isFinite(R[i]));
      sum += L[i] * L[i];
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    }
  }
  return {
    rms: Math.sqrt(sum / (Math.ceil((seconds * 48000) / 128) * 128)),
    peak,
  };
}
for (const preset of context.presets) {
  const p = new context.Processor();
  for (const [key, value] of Object.entries(preset.values))
    p.onMessage({ type: "param", key, value });
  for (const n of [21, 48, 60, 64, 67, 84, 108]) p.noteOn(n, 100);
  const attack = render(p, 0.5);
  assert(attack.rms > 0.001);
  assert(attack.peak <= 1);
  p.onMessage({ type: "allOff" });
  render(p, 1);
  assert(render(p, 0.1).rms < 0.00001);
  console.log(preset.name, attack);
}
function release(pedal) {
  const p = new context.Processor();
  p.noteOn(60, 100);
  render(p, 0.3);
  p.onMessage({ type: "sustain", on: pedal });
  p.noteOff(60);
  render(p, 0.6);
  return render(p, 0.2).rms;
}
assert(release(true) > release(false) * 10);
const p = new context.Processor();
for (let n = 21; n <= 108; n++) p.noteOn(n, 127);
const stress = render(p, 2);
assert(stress.peak <= 1);
assert.equal(p.voices.length, 40);
p.onMessage({ type: "param", key: "decay", value: NaN });
assert.equal(p.p.decay, 1);
p.noteOn(NaN, 127);
p.noteOn(200, 127);
render(p, 0.1);
console.log(
  "PASS: six voicings, finite stereo output, release/sustain, panic, voice limit, invalid input",
  stress,
);
