// 863008 initial no-input branch. Inputs are final excitation amplitude/phase,
// modal frequency and per-lane pitch adjustment, not raw instrument archives.
import { fma32 } from './modal-kernel.mjs';
import { nativeModalTrig } from './native-modal-trig.mjs';
import { neonReciprocalNormal } from './neon-reciprocal.mjs';
import { baseDecay, smallExpPolynomial, expPolynomial } from './modal-coefficients.mjs';
import { nativeVectorExpLane } from './native-vector-exp.mjs';
const f = Math.fround, word = new DataView(new ArrayBuffer(4));
const constant = bits => { word.setUint32(0, bits); return word.getFloat32(0); };
const TAU = constant(0x40c90fdb), SIN_EPSILON = constant(0x2edbe6ff), COS_MINIMUM = constant(0x3089705f);

export function modalAngleGroup({ frequency, pitchAdjustment, timestep, pitch, adjustmentRatio }) {
  if ([frequency, pitchAdjustment].some(x => x?.length !== 4 || !Array.from(x).every(Number.isFinite)) ||
      ![timestep, pitch, adjustmentRatio].every(Number.isFinite) || timestep <= 0)
    throw new RangeError('Four finite frequency lanes and finite controls required');
  const step = f(f(f(timestep) * TAU) * f(pitch)), delta = f(f(adjustmentRatio) - 1);
  const theta = Float32Array.from(frequency, (value, i) => f(fma32(pitchAdjustment[i], delta, value) * step));
  const trig = nativeModalTrig(theta);
  return { theta, S: trig.sin, cosTheta: trig.cos,
    K: Float32Array.from(trig.cos, value => Math.abs(value) <= COS_MINIMUM ? COS_MINIMUM : value),
    sinInverse: Float32Array.from(trig.sin, value => neonReciprocalNormal(f(value + SIN_EPSILON))) };
}

export function initialModalGroup({ frequency, pitchAdjustment, amplitude, phase, timestep, pitch, adjustmentRatio, inputMode }) {
  if (inputMode !== 0) throw new RangeError('Only verified no-input initial state is implemented');
  if ([frequency, pitchAdjustment, amplitude, phase].some(x => x?.length !== 4 || !Array.from(x).every(Number.isFinite)) ||
      ![timestep, pitch, adjustmentRatio].every(Number.isFinite) || timestep <= 0)
    throw new RangeError('Four finite lanes and finite controls required');
  const angles = modalAngleGroup({ frequency, pitchAdjustment, timestep, pitch, adjustmentRatio });
  const { theta } = angles, angleTrig = { sin: angles.S, cos: angles.cosTheta }, phaseTrig = nativeModalTrig(phase);
  const P = new Float32Array(4), Q = new Float32Array(4), energy = new Float32Array(4);
  const K = new Float32Array(4), sinInverse = new Float32Array(4);
  for (let i = 0; i < 4; i++) {
    const a = f(amplitude[i]);
    P[i] = f(phaseTrig.sin[i] * a);
    Q[i] = f(fma32(phaseTrig.sin[i], angleTrig.cos[i], f(phaseTrig.cos[i] * angleTrig.sin[i])) * a);
    energy[i] = f(a * a);
    K[i] = angles.K[i];
    sinInverse[i] = angles.sinInverse[i];
  }
  return { theta, sinTheta: angleTrig.sin, cosTheta: angleTrig.cos, sinPhase: phaseTrig.sin, cosPhase: phaseTrig.cos,
    P, Q, energy, S: angleTrig.sin, K, sinInverse };
}

// 863770..37a8: frequency refresh re-expresses P with the OLD R/K/inverse
// and the NEW S/K; Q is held. Products and the two FMA sites stay distinct.
export function projectModalHistory({ P, Q, oldRadius, oldCosine, oldSinInverse, newSine, newCosine }) {
  const n = P.length;
  if (!n || [P, Q, oldRadius, oldCosine, oldSinInverse, newSine, newCosine].some(x => x.length !== n || !Array.from(x).every(Number.isFinite)))
    throw new RangeError('Matching finite modal history arrays required');
  return Float32Array.from(P, (value, i) => {
    const difference = fma32(-oldCosine[i], Q[i], f(f(oldRadius[i]) * f(value)));
    const orthogonal = f(f(oldSinInverse[i]) * difference);
    const projected = fma32(Q[i], newCosine[i], f(f(newSine[i]) * orthogonal));
    return f(neonReciprocalNormal(oldRadius[i]) * projected);
  });
}

export function dampInitialQ(Q, radius) {
  if (Q.length !== radius.length || !Array.from(Q).every(Number.isFinite) || !Array.from(radius).every(Number.isFinite))
    throw new RangeError('Matching finite state and radius required');
  return Float32Array.from(Q, (value, i) => f(f(value) * f(radius[i])));
}

// Observed initial branch: no damper-position/global correction and uniform
// release-frequency shape. Eight-lane groups and the four-lane tail call
// different exponential implementations even when their results are close.
export function initialModalRadii(modalDecayGroups, controls) {
  const { timestep, pitch, scale, release, positionGain, extraGain, releaseShape } = controls;
  if (![timestep, pitch, scale, release, positionGain, extraGain, releaseShape].every(Number.isFinite) ||
      timestep <= 0 || positionGain !== 0 || extraGain !== 0 || releaseShape !== 1)
    throw new RangeError('Uncorrected uniform initial decay branch required');
  return modalDecayGroups.map(group => {
    if (!group.length || group.length % 4 || !Array.from(group).every(Number.isFinite))
      throw new RangeError('Finite padded decay groups required');
    const decay = Float32Array.from(group, value => baseDecay(value, pitch, scale, release));
    const x = Float32Array.from(decay, value => f(-f(timestep) * value)), radius = new Float32Array(group.length);
    const prefix = Math.floor(group.length / 8) * 8;
    for (let i = 0; i < prefix; i += 8) {
      const fast = Array.from(x.slice(i, i + 8)).every(value => Math.abs(value) <= f(0.15));
      for (let j = i; j < i + 8; j++) radius[j] = fast ? smallExpPolynomial(x[j]) : expPolynomial(x[j]);
    }
    for (let i = prefix; i < group.length; i++) radius[i] = nativeVectorExpLane(x[i]);
    return { decay, radius };
  });
}
