// Just Piano — synthesis engine (AudioWorklet).
//
// An original modal model of a piano string: every partial of every note is a
// damped complex oscillator. Physical behaviours that shape the sound:
//   - string stiffness  -> inharmonic partials  f_k = k f0 sqrt(1 + B k^2)
//   - hammer strike     -> comb-shaped spectrum from the strike position, and a
//                          velocity/hardness dependent low-pass (felt compression)
//   - unison strings    -> two slightly detuned components per partial, one with
//                          a fast "prompt" decay and one with a slow "aftersound"
//   - frequency-dependent losses, dampers (none in the top treble), sustain and
//     una corda pedals, octave stretching and a short hammer/key thump.

const MAX_VOICES = 40;
const MAX_PARTIALS = 30;
const OSC_PER_VOICE = MAX_PARTIALS * 2;
const LAST_DAMPED_NOTE = 89; // real pianos have no dampers above roughly F6

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Inharmonicity coefficient across the keyboard (log-interpolated).
function inharmonicity(m) {
  const pts = [[21, -3.6], [40, -4.0], [64, -3.6], [88, -2.9], [108, -2.3]];
  for (let i = 1; i < pts.length; i++) {
    if (m <= pts[i][0]) {
      const [m0, b0] = pts[i - 1], [m1, b1] = pts[i];
      const t = (m - m0) / (m1 - m0);
      return Math.pow(10, b0 + (b1 - b0) * Math.max(0, t));
    }
  }
  return Math.pow(10, -2.3);
}

class Voice {
  constructor() {
    this.re = new Float64Array(OSC_PER_VOICE);
    this.im = new Float64Array(OSC_PER_VOICE);
    this.cr = new Float64Array(OSC_PER_VOICE);
    this.ci = new Float64Array(OSC_PER_VOICE);
    this.k = 0;
    this.active = false;
    this.note = -1;
    this.keyDown = false;
    this.dying = false;
    this.env = 1;
    this.relCoef = 1;
    this.fadeCoef = 1;
    this.att = 1;
    this.attInc = 1;
    this.nAmp = 0;
    this.nDec = 0;
    this.lp = 0;
    this.lpC = 0;
    this.gl = 0.7;
    this.gr = 0.7;
    this.level = 0;
    this.age = 0;
    this.stamp = 0;
  }
}

class JustPianoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = Array.from({ length: MAX_VOICES }, () => new Voice());
    this.sustain = false;
    this.soft = 0;
    this.counter = 0;
    this.p = {
      hardness: 0.5,   // hammer hardness 0..1
      unison: 0.5,     // unison detune 0..1
      curve: 1.0,      // velocity exponent
      stretch: 1.0,    // octave stretching amount
      noise: 0.5,      // hammer noise 0..1
    };
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(msg) {
    switch (msg.type) {
      case 'on': this.noteOn(msg.note, msg.vel); break;
      case 'off': this.noteOff(msg.note); break;
      case 'sustain': this.sustain = !!msg.on; this.updateDampers(); break;
      case 'soft': this.soft = msg.value; break;
      case 'param': this.p[msg.key] = msg.value; break;
      case 'allOff':
        for (const v of this.voices) if (v.active) { v.keyDown = false; v.dying = true; v.fadeCoef = Math.exp(-6.91 / (0.15 * sampleRate)); }
        this.sustain = false;
        break;
    }
  }

  isDamped(v) {
    if (v.dying) return true;
    if (v.keyDown || this.sustain) return false;
    return v.note <= LAST_DAMPED_NOTE;
  }

  updateDampers() {
    for (const v of this.voices) {
      if (!v.active) continue;
      const wasDamped = v.damped;
      v.damped = this.isDamped(v);
      if (v.damped && !wasDamped && !v.dying) this.damperNoise(v);
    }
  }

  damperNoise(v) {
    const a = 0.004 * this.p.noise;
    if (a <= 0) return;
    v.nAmp = Math.max(v.nAmp, a);
    v.nDec = Math.exp(-1 / (0.03 * sampleRate));
    v.lpC = 1 - Math.exp(-2 * Math.PI * 500 / sampleRate);
  }

  allocVoice() {
    let best = null;
    for (const v of this.voices) if (!v.active) return v;
    // Steal the quietest voice, preferring ones that are already released.
    let bestScore = Infinity;
    for (const v of this.voices) {
      const score = v.level * (v.keyDown ? 4 : 1);
      if (score < bestScore) { bestScore = score; best = v; }
    }
    return best;
  }

  noteOn(m, vel) {
    if (vel <= 0) return this.noteOff(m);
    const sr = sampleRate;
    // The hammer restrikes the same strings: let the old sound fall away fast.
    for (const v of this.voices) {
      if (v.active && v.note === m && !v.dying) {
        v.dying = true; v.keyDown = false; v.damped = true;
        v.fadeCoef = Math.exp(-6.91 / (0.09 * sr));
      }
    }
    const v = this.allocVoice();
    const p = this.p;
    const vv = Math.pow(Math.min(1, vel / 127), p.curve);
    const hard = Math.max(0, Math.min(1, p.hardness)) * (1 - 0.4 * this.soft);

    // Octave stretching (Railsback-like), in cents.
    const d = m - 69;
    const stretchCents = p.stretch * (d > 0 ? 0.0075 * d * d : -0.011 * d * d);
    const f0 = mtof(m) * Math.pow(2, stretchCents / 1200);
    const B = inharmonicity(m);

    const strings = m < 34 ? 1 : m < 46 ? 2 : 3;
    const seed = Math.sin(m * 12.9898) * 43758.5453;
    const rnd = seed - Math.floor(seed);
    const detune = strings > 1 ? p.unison * (0.35 + 0.9 * rnd) * (strings === 3 ? 1 : 0.7) : 0;
    const up = Math.pow(2, detune / 1200), down = Math.pow(2, -detune / 1200);

    // Hammer: strike position and felt low-pass.
    const strike = 0.115 + 0.02 * rnd;
    const fc = f0 * (1.2 + (2.5 + 16 * hard) * Math.pow(vv, 1.3)) + 150 + 900 * hard * vv;

    // Losses: slow aftersound T60 and a faster prompt sound.
    const T60 = Math.max(5, 42 * Math.exp(-(m - 21) * 0.036));
    const base = 6.91 / T60;

    const nyq = 0.45 * sr;
    let k = 0, energy = 0;
    const amps = [];
    for (let n = 1; n <= MAX_PARTIALS; n++) {
      const fn = n * f0 * Math.sqrt(1 + B * n * n);
      if (fn * up >= nyq) break;
      const comb = Math.abs(Math.sin(n * Math.PI * strike)) + 0.06;
      const lp = 1 / Math.sqrt(1 + Math.pow(fn / fc, 4));
      const A = comb * lp / Math.pow(n, 0.55);
      if (n > 4 && A < 2e-3) break;
      const slow = base * (1 + 0.06 * (n - 1)) + 1.5e-7 * fn * fn;
      const fast = slow * 2.8 + 1.2;
      amps.push([fn, A, slow, fast]);
      energy += A * A;
    }
    const norm = 1 / Math.sqrt(energy || 1);
    const gain = 0.22 * Math.pow(vv, 1.15) * (1 - 0.25 * this.soft) * (0.55 + 0.45 * Math.pow(vv, 0.5));
    for (const [fn, A, slow, fast] of amps) {
      const a = A * norm * gain;
      // Prompt sound: one polarization, detuned up, decays fast.
      this.setOsc(v, k++, fn * up, fast, a * 0.55);
      // Aftersound: detuned down, decays slow.
      this.setOsc(v, k++, fn * down, slow, a * 0.45);
    }
    v.k = k;
    v.note = m;
    v.active = true;
    v.keyDown = true;
    v.dying = false;
    v.damped = false;
    v.env = 1;
    v.fadeCoef = 1;
    const tRel = 0.85 * Math.exp(-(m - 21) / 42);
    v.relCoef = Math.exp(-6.91 / (tRel * sr));
    const contactMs = (0.7 + 3.2 * (1 - vv) * (1 - 0.45 * hard)) * (m < 55 ? 1.5 : 1);
    v.att = 0;
    v.attInc = 1 / Math.max(1, contactMs * 0.001 * sr);
    // Hammer/key thump: low-passed noise burst.
    v.nAmp = 0.05 * Math.pow(vv, 1.6) * p.noise * (m < 60 ? 1 : 0.7);
    v.nDec = Math.exp(-1 / (0.011 * sr));
    v.lpC = 1 - Math.exp(-2 * Math.PI * (180 + 1400 * vv * (0.5 + hard)) / sr);
    v.lp = 0;
    const pos = 0.5 + 0.55 * ((m - 21) / 87 - 0.5);
    v.gl = Math.cos(pos * Math.PI / 2) * 1.414;
    v.gr = Math.sin(pos * Math.PI / 2) * 1.414;
    v.level = gain;
    v.age = 0;
    v.stamp = ++this.counter;
  }

  setOsc(v, i, f, rate, amp) {
    const sr = sampleRate;
    const g = Math.exp(-rate / sr);
    const w = 2 * Math.PI * f / sr;
    v.cr[i] = g * Math.cos(w);
    v.ci[i] = g * Math.sin(w);
    v.re[i] = amp;
    v.im[i] = 0;
  }

  noteOff(m) {
    for (const v of this.voices) {
      if (v.active && v.note === m && v.keyDown) {
        v.keyDown = false;
        const was = v.damped;
        v.damped = this.isDamped(v);
        if (v.damped && !was) this.damperNoise(v);
      }
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const N = L.length;
    for (const v of this.voices) {
      if (!v.active) continue;
      const re = v.re, im = v.im, cr = v.cr, ci = v.ci, K = v.k;
      const rc = (v.damped ? v.relCoef : 1) * v.fadeCoef;
      let env = v.env, att = v.att;
      const attInc = v.attInc;
      let nAmp = v.nAmp, lp = v.lp;
      const nDec = v.nDec, lpC = v.lpC, gl = v.gl, gr = v.gr;
      let peak = 0;
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let k = 0; k < K; k++) {
          const r = re[k], q = im[k];
          re[k] = r * cr[k] - q * ci[k];
          const nq = r * ci[k] + q * cr[k];
          im[k] = nq;
          s += nq;
        }
        if (att < 1) { att += attInc; if (att > 1) att = 1; s *= att * att; }
        if (nAmp > 1e-6) {
          lp += lpC * ((Math.random() * 2 - 1) - lp);
          s += lp * nAmp;
          nAmp *= nDec;
        }
        env *= rc;
        const y = s * env;
        L[i] += y * gl;
        R[i] += y * gr;
        const a = y < 0 ? -y : y;
        if (a > peak) peak = a;
      }
      v.env = env; v.att = att; v.nAmp = nAmp; v.lp = lp;
      v.level = peak;
      v.age++;
      if (v.age > 8 && peak < 5e-6) { v.active = false; v.note = -1; }
    }
    return true;
  }
}

registerProcessor('just-piano', JustPianoProcessor);
