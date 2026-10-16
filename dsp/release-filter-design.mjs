// Observed 0ab720 types 2, 3 and 5. Other filter types are deliberately rejected.
import { nativeScalarExp } from './native-scalar-exp.mjs';
import { buildVectorFilterTable } from './vector-filter.mjs';
const f = Math.fround;
export function designReleaseFilter({ type, frequency, q, decibels }, sampleRate) {
  const normalized = Math.max(f(3e-5), Math.min(f(.99997), f(frequency / f(sampleRate * .5))));
  const angle = f(normalized * Math.PI);
  const A = nativeScalarExp(f(f(decibels / 40) * f(2.3025851)));
  const alpha = f(f(Math.sin(angle)) / f(q + q));
  const cosine = f(Math.cos(angle));
  let b0, b1, b2, a0, a1, a2, gain = 1;
  if (type === 5) {
    b1 = -f(cosine + 1); b0 = f(f(cosine + 1) * .5); b2 = b0;
    a0 = f(alpha + 1); a1 = f(cosine * -2); a2 = f(1 - alpha); gain = f(A * A);
  } else if (type === 2 || type === 3) {
    const sum = f(A + 1), difference = f(A - 1);
    const product = f(difference * cosine);
    const spread = f(f(f(Math.sqrt(A)) + f(Math.sqrt(A))) * alpha);
    if (type === 2) {
      const z = f(sum - product);
      b0 = f(A * f(z + spread));
      b1 = f(f(A + A) * f(difference - f(sum * cosine)));
      b2 = f(A * f(z - spread));
      const z2 = f(sum + product);
      a0 = f(z2 + spread); a1 = f(f(difference + f(sum * cosine)) * -2); a2 = f(z2 - spread);
    } else {
      const z = f(sum + product);
      b0 = f(A * f(z + spread));
      b1 = f(f(A * -2) * f(difference + f(sum * cosine)));
      b2 = f(A * f(z - spread));
      const z2 = f(sum - product);
      a0 = f(z2 + spread); a1 = f(f(difference - f(sum * cosine)) * 2); a2 = f(z2 - spread);
    }
  } else throw new Error(`Unverified release-filter type ${type}`);
  if (Math.abs(b0) <= 1e-20 || Math.abs(a0) <= 1e-20) throw new Error('Unverified degenerate release filter');
  const invB0 = f(1 / b0), invA0 = f(1 / a0);
  return { gain: f(invA0 * f(gain * b0)),
    coefficients: Float32Array.of(f(b1 * invB0), f(b2 * invB0), -f(a1 * invA0), -f(invA0 * a2)) };
}

export function initializeReleaseFilters(controls, sampleRate, channelGain = 1) {
  const sections = controls.map(c => designReleaseFilter(c, sampleRate));
  const table = new Float32Array(sections.length * 32);
  let totalGain = channelGain;
  sections.forEach((s, i) => {
    const gain = i === 0 ? f(s.gain * channelGain) : s.gain;
    const c = s.coefficients;
    table.set(buildVectorFilterTable(gain, f(c[0] * gain), f(gain * c[1]), c[2], c[3]), i * 32);
    totalGain = f(totalGain * s.gain);
  });
  return { sections, table, totalGain, history: new Float32Array(sections.length * 4) };
}
