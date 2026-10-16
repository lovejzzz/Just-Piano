import { interpolateHardness } from './physical-controls.mjs';
import { fma32 } from './modal-kernel.mjs';
const fl = Math.fround;

// The scalar controls between position correction and spectrum construction.
// Random hardness, edited u, and alternate hardness modes remain unverified.
export function excitationHardness({ header, source, controls: c, curves }, { cosf } = {}) {
  if (c.u !== 0 || c.hardnessMode !== 0 ||
      typeof c.randomSeedPresent !== 'boolean' ||
      !Array.isArray(c.randomFlags) || c.randomFlags.length !== 3 ||
      (c.randomSeedPresent && c.randomFlags.some(x => x !== 0)))
    throw new RangeError('Unverified hardness edit or randomization branch');
  const { velocity, blendFloor, inputBlend, attenuation, repeatScale,
    positiveGain, negativeGain, fallbackFrequency, sharedBlendCoefficients: coefficients } = c;
  if (coefficients.length !== 2 || ![velocity, blendFloor, inputBlend, attenuation,
    repeatScale, positiveGain, negativeGain, fallbackFrequency, ...coefficients].every(Number.isFinite) ||
    attenuation < 0 || attenuation > 1 || !Number.isInteger(c.direction) || ![0, 1].includes(c.repeatFlag))
    throw new TypeError('Finite scalar controls required');
  const [columns, rows, , , referenceRow] = header;
  if (!Number.isInteger(rows) || rows < 0 || (rows &&
      (!Number.isInteger(referenceRow) || referenceRow >= rows || referenceRow < 0 ||
       !Number.isInteger(columns) || columns < 1 || source.frequency.length !== rows * columns)))
    throw new RangeError('Invalid source reference row');
  const referenceFrequency = rows ? fl(source.frequency[referenceRow * columns]) : fl(fallbackFrequency);
  const blends = [blendFloor, inputBlend].map((b, i) => fl(fl(1 - fl(b)) + fl(fl(b) * fl(coefficients[i]))));
  let common = Math.min(...blends);
  if (c.repeatFlag) {
    if (!(c.age > 0) || typeof cosf !== 'function') throw new RangeError('Repeat branch requires age and explicit cosf');
    const argument = fl((referenceFrequency * (2 * Math.PI)) * fl(c.age));
    common = fl(common * fma32(cosf(argument), fl(fl(attenuation) * fl(fl(repeatScale) - 1)), 1));
  }
  common = fl(common * fl(1 / fl(fl(fl(c.u) + fl(c.u)) + 1)));
  const hardness = Object.fromEntries(['primary', 'secondary'].map(name => [name,
    interpolateHardness({ ...curves[name], velocity, u: c.u, mode: c.hardnessMode })]));
  let primary = fl(common * hardness.primary), secondary = fl(common * hardness.secondary);
  if (velocity > 1) {
    const t = fl(fl(fl(1.3) - fl(velocity)) / fl(0.3));
    primary = fl(primary + fma32(t, 0, fl(fl(1 - t) * fl(0.8))));
  }
  if (c.direction !== 0) {
    const gain = fl(c.direction > 0 ? positiveGain : negativeGain);
    primary = fl(primary * gain); secondary = fl(secondary * gain);
  }
  return { primary, secondary, referenceFrequency, hardness, blends, common };
}
