// Reconstructed 2ff628 arithmetic. Platform transcendental calls are explicit
// dependencies; no claim is made that JS Math has identical binary64 results.
import { fma32 } from './modal-kernel.mjs';
import { fma64 } from './modal-poles.mjs';
import { nativeScalarLogf } from './native-scalar-log.mjs';
const f32 = Math.fround;
const word = new DataView(new ArrayBuffer(8));
function d64(bits) { word.setBigUint64(0, bits); return word.getFloat64(0); }
const LN10 = d64(0x40026bb1bbb55516n);
const ZERO_COS_LOG = d64(0xc0126bb1bd355516n);
const ZERO_COS_MIN = d64(0x3bc79ca100000000n);

export function impedancePhaseCurve(curve, input) {
  const { x, y, flags = 0, special = 0, dimension = 1 } = curve;
  if (special !== 0 || dimension !== 1 || !y.length || (x.length && y.length !== x.length))
    throw new RangeError('Only ordinary scalar curve layout is implemented');
  input = f32(input);
  if (x.length < 2 || input <= f32(x[0])) return f32(y[0]);
  if (input >= f32(x.at(-1))) return f32(y.at(-1));
  let index = 0;
  while (input >= f32(x[index + 1])) index++;
  let fraction = 1;
  if ((flags & 1) === 0) {
    const width = f32(f32(x[index + 1]) - f32(x[index]));
    if (width > 1e-30) fraction = f32(f32(input - f32(x[index])) / width);
  } else {
    const clamp = value => Math.min(f32(1e10), Math.max(f32(1e-10), f32(value)));
    const left = clamp(x[index]);
    const denominator = nativeScalarLogf(f32(clamp(x[index + 1]) / left));
    if (denominator > 1e-30) fraction = f32(nativeScalarLogf(f32(clamp(input) / left)) / denominator);
  }
  return fma32(f32(1 - fraction), f32(y[index]), f32(fraction * f32(y[index + 1])));
}

export function modalImpedance(input, math) {
  const { strength, minimumReference, tilt, phaseCurve, mixture,
    bandFrequencies, bandDb, polarRadius } = input;
  const fundamental = f32(input.fundamental), reference = f32(input.reference);
  const frequency = f32(input.frequency), extraDb = f32(input.extraDb);
  if (![fundamental, reference, frequency, extraDb, strength, minimumReference, tilt, mixture, polarRadius].every(Number.isFinite) ||
      reference <= 0 || frequency <= 0 || polarRadius < 0 || mixture < 0 || mixture > 1)
    throw new RangeError('Unsupported impedance input domain');
  if (!(f32(strength) > 1e-20)) throw new RangeError('Native strength assertion');
  if (bandFrequencies.length !== bandDb.length) throw new RangeError('Impedance band vector sizes differ');
  for (const name of ['log2f', 'exp', 'sincos', 'tan', 'pow', 'log'])
    if (typeof math?.[name] !== 'function') throw new TypeError(`Explicit native ${name} dependency required`);
  const ratio = f32(frequency / Math.max(f32(minimumReference), reference));
  const slopeDb = Math.min(f32(-f32(tilt) * f32(math.log2f(ratio))), 0);
  const initialDb = Math.max(slopeDb, -200) + extraDb;
  let gain = math.exp((initialDb / 10) * LN10) * f32(strength);
  if (!(gain > 1e-40)) throw new RangeError('Native gain assertion');
  const initialGain = gain;
  const relative = bandFrequencies.length && Math.min(...bandFrequencies) < 50;
  const bandScale = relative ? fundamental : 1;
  const bands = [];
  for (let j = 0; j < bandFrequencies.length; j++) {
    const center = f32(bandScale * f32(bandFrequencies[j]));
    if (center <= reference * 2.5) { bands.push({ index: j, skipped: true }); continue; }
    const difference = (frequency - center) / reference;
    const square = difference * difference;
    const gaussian = square < 100 ? math.exp(-square) : 0;
    const correction = math.exp(((gaussian * f32(bandDb[j])) / 10) * LN10);
    gain *= correction;
    bands.push({ index: j, center, difference, gaussian, correction });
  }
  const phaseDegrees = impedancePhaseCurve(phaseCurve, frequency);
  const theta = f32(phaseDegrees / 180) * Math.PI;
  const trig = math.sincos(theta);
  const realPolar = trig.cos * f32(polarRadius), imagPolar = trig.sin * f32(polarRadius);
  const tangent = math.tan(theta);
  const cosineMagnitude = 1 / Math.sqrt(fma64(tangent, tangent, 1));
  const complement = f32(1 - f32(mixture));
  const quarterPower = math.pow(complement, 0.25);
  const logarithm = cosineMagnitude === 0 ? ZERO_COS_LOG : math.log(cosineMagnitude);
  let phaseGain = math.exp(fma64(logarithm, f32(mixture), complement * 0));
  if (cosineMagnitude === 0) {
    phaseGain *= f32(quarterPower);
    if (Math.abs(phaseGain) < ZERO_COS_MIN) phaseGain = ZERO_COS_MIN;
  }
  const clampedGain = Math.min(1e12, Math.max(1, gain));
  const scale = clampedGain * phaseGain;
  return { p: realPolar * scale, q: imagPolar * scale,
    ratio, slopeDb, initialDb, initialGain, bands, phaseDegrees, theta,
    cosineMagnitude, phaseGain, gainBeforeClamp: gain, clampedGain };
}

// 09b1bc's ordinary note-grid interval selector. It selects two curve objects;
// it does not itself evaluate or blend their frequency-dependent outputs.
export function impedanceCurvePair(coordinates, input) {
  input = f32(input);
  if (coordinates.length <= 1) return { left: 0, right: 0, fraction: 0 };
  const last = coordinates.length - 1;
  if (input >= f32(coordinates[last])) return { left: last, right: last, fraction: 1 };
  let left = 0;
  while (input >= f32(coordinates[left + 1])) left++;
  const width = f32(f32(coordinates[left + 1]) - f32(coordinates[left]));
  let fraction = width > 1e-30 ? f32(f32(input - f32(coordinates[left])) / width) : 1;
  fraction = Math.min(1, Math.max(0, fraction));
  return { left: fraction === 1 ? left + 1 : left,
    right: fraction === 0 ? left : left + 1, fraction };
}

// 194b3c..194d30 applies deterministic modal coupling jitter after 2ff628.
// Restart the state for each 194870 model call, not for each component.
export function couplingJitterFactors(note, amount, count) {
  note = f32(note); amount = f32(amount);
  if (!Number.isFinite(note) || !Number.isFinite(amount) || note < 0 || note > 127 || !Number.isInteger(count) || count < 0)
    throw new RangeError('Expected MIDI note and nonnegative modal row count');
  const step = value => (Math.imul(value, 0x41c64e6d) + 0x3039) >>> 0;
  let x = Math.trunc(fma32(note, 10, 10000)) >>> 0;
  let y = step(x), z = step(y), w = step(z);
  const factors = new Float64Array(count);
  for (let j = 0; j < count; j++) {
    const t = (x ^ (x << 11)) >>> 0;
    x = y; y = z; z = w;
    w = ((w >>> 19) ^ (t >>> 8) ^ w ^ t) >>> 0;
    factors[j] = fma64(f32(w / 4294967296) - 0.5, amount, 1);
  }
  return factors;
}
