// Normal uniform-frequency decay branch, retaining padded group reductions and
// the distinct paired-eight / external-four exponential paths.
import { baseDecay, energyNormalization, positionAdjustedDecay,
  smallExpPolynomial, expPolynomial, recurrenceCoefficients } from './modal-coefficients.mjs';
import { nativeVectorExpLane } from './native-vector-exp.mjs';
const f32 = Math.fround;

export function refreshDampedModes(groups, controls) {
  const { timestep, pitch, scale, release, gain, extraGain, releaseShape, blockLength, blockFactor } = controls;
  if (extraGain !== 0 || releaseShape !== 1 || !groups.length ||
      groups.some(g => !g.length || g.length % 4)) {
    throw new RangeError('Padded normal damping branch required');
  }
  const baseGroups = groups.map(group => group.map(row => ({ ...row,
    base: baseDecay(row.modalDecay, pitch, scale, release) })));
  const normalization = gain === 0 ? 0 : energyNormalization(baseGroups,
    { timestep, gain, blockLength, blockFactor });
  const result = baseGroups.map(group => {
    const decay = group.map(row => gain === 0 ? row.base :
      positionAdjustedDecay(row.base, gain, row.weight, normalization));
    const x = decay.map(value => f32(-f32(timestep) * value));
    const radius = new Float32Array(group.length), prefix = Math.floor(group.length / 8) * 8;
    for (let i = 0; i < prefix; i += 8) {
      const fast = x.slice(i, i + 8).every(value => Math.abs(value) <= f32(0.15));
      for (let j = i; j < i + 8; j++) radius[j] = fast ? smallExpPolynomial(x[j]) : expPolynomial(x[j]);
    }
    for (let i = prefix; i < group.length; i++) radius[i] = nativeVectorExpLane(x[i]);
    return group.map((row, i) => ({ decay: decay[i], radius: radius[i],
      ...recurrenceCoefficients(radius[i], row.cosine) }));
  });
  return { normalization, groups: result };
}
