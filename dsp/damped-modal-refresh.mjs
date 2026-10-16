// Normal uniform-frequency decay branch, retaining padded group reductions and
// the distinct paired-eight / external-four exponential paths.
import { baseDecay, energyNormalization, positionAdjustedDecay,
  smallExpPolynomial, expPolynomial, recurrenceCoefficients } from './modal-coefficients.mjs';
import { nativeVectorExpLane } from './native-vector-exp.mjs';
import { fma32 } from './modal-kernel.mjs';
const f32 = Math.fround;

export function refreshDampedModes(groups, controls) {
  const { timestep, pitch, scale, release, gain, extraGain, releaseShape, releaseLow, releaseHigh, blockLength, blockFactor } = controls;
  if (extraGain !== 0 || !Number.isFinite(releaseShape) || !groups.some(g => g.length) ||
      groups.some(g => g.length % 4)) {
    throw new RangeError(`Padded normal damping branch required: extraGain=${extraGain}, releaseShape=${releaseShape}, groupLengths=${groups.map(g => g.length).join(',')}`);
  }
  if (releaseShape !== 1 && (!Number.isFinite(releaseLow) || !Number.isFinite(releaseHigh) ||
      groups.some(g => g.some(row => typeof row.active !== 'boolean' || !Number.isFinite(row.frequency)))))
    throw new RangeError('Frequency-shaped damping requires thresholds and logical lane coverage');
  const inverseSpan = releaseShape === 1 ? 0 : f32(-1 / Math.max(f32(releaseHigh - releaseLow), f32(1e-5)));
  const baseGroups = groups.map(group => group.map(row => {
    let base = baseDecay(row.modalDecay, pitch, scale, release);
    // 8638e8..3988 changes logical lanes only; padded lanes retain baseDecay.
    if (releaseShape !== 1 && row.active) {
      if (row.frequency < releaseLow) base = fma32(release, releaseShape, row.modalDecay);
      else if (row.frequency < releaseHigh) {
        const x = f32(f32(row.frequency - releaseHigh) * inverseSpan);
        const shape = fma32(f32(releaseShape - 1), f32(x * x), 1);
        base = fma32(release, shape, row.modalDecay);
      }
    }
    return { ...row, base };
  }));
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
