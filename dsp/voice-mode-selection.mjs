// 839c04: frequency routing and short-term amplitude/decay mode culling.
import { fma32 } from './modal-kernel.mjs';
import { nativeScalarLog2f } from './native-scalar-log2.mjs';
const f32 = Math.fround;
const view = new DataView(new ArrayBuffer(8));
const word = x => { view.setUint32(0, x); return view.getFloat32(0); };
const LN2 = Math.LN2; // binary64 word 3fe62e42fefa39ef
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };

export function selectVoiceModes({ source, columns, splitRow, sampleRate, groupCount, splitFrequency,
  alignment, bypassAmplitudeFilter, amplitudeThreshold, projectedThreshold }, { log2f = nativeScalarLog2f } = {}) {
  const size = source.frequency?.length;
  if (!Number.isInteger(columns) || columns < 1 || !size || size % columns ||
      !['frequency', 'amplitude', 'decay'].every(key => source[key]?.length === size && Array.from(source[key]).every(Number.isFinite)))
    throw new RangeError('Complete rectangular selection tables required');
  const rows = size / columns;
  if (!Number.isInteger(groupCount) || groupCount < 1 || groupCount > 3 ||
      !Number.isInteger(splitRow) || splitRow < 0 || splitRow > rows ||
      !Number.isInteger(alignment) || alignment < 4 || alignment % 4 ||
      ![sampleRate, splitFrequency, amplitudeThreshold, projectedThreshold].every(Number.isFinite) ||
      sampleRate <= 0 || amplitudeThreshold < 0 || projectedThreshold <= 0 ||
      typeof bypassAmplitudeFilter !== 'boolean' || typeof log2f !== 'function')
    throw new RangeError('Selection controls and scalar log2f implementation required');
  sampleRate = f32(sampleRate); splitFrequency = f32(splitFrequency);
  amplitudeThreshold = f32(amplitudeThreshold); projectedThreshold = f32(projectedThreshold);
  const logThreshold = f32(log2f(projectedThreshold));
  if (!Number.isFinite(logThreshold)) throw new RangeError('Nonfinite threshold logarithm');
  const cutoff = f32(sampleRate * word(0x3ef851ec));
  const duration = f32(64 / sampleRate);
  const indices = [], layout = [], decisions = [];
  for (let group = 0; group < groupCount; group++) {
    const start = indices.length;
    for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
      const i = row * columns + column;
      const frequency = f32(source.frequency[i]);
      const candidate = column + (row >= splitRow ? 1 : 0);
      const routed = groupCount === 1 ? 0 : candidate === 0 || frequency <= splitFrequency ? candidate % groupCount : 0;
      if (routed !== group) continue;
      let reason = 'keep';
      if (frequency > cutoff) reason = 'frequency';
      else if (!bypassAmplitudeFilter) {
        const amplitude = f32(source.amplitude[i]), decay = f32(source.decay[i]);
        const projected = f32(amplitude * fma32(-duration, decay, 1));
        if (projected <= projectedThreshold) {
          if (decay <= 0 && (decay !== 0 || amplitude !== 0))
            throw new RangeError('Native selection rejects nonpositive decay with nonzero amplitude');
          if (amplitude < amplitudeThreshold) reason = 'amplitude';
          else if (decay >= word(0x26901d7d)) {
            const exponent = ((bits(amplitude) >>> 23) & 255) - 127;
            const remaining = f32(f32(exponent - logThreshold) * f32((sampleRate * LN2) / decay));
            if (remaining <= 64) reason = 'decay';
          }
        }
      }
      decisions.push({ sourceIndex: i, group, reason });
      if (reason === 'keep') indices.push(i);
    }
    const count = indices.length - start;
    const padded = Math.ceil(indices.length / alignment) * alignment;
    layout.push([start, padded, count, count]);
    // Native index padding is a sentinel. It is never gathered as a source lane.
    if (group + 1 < groupCount) while (indices.length < padded) indices.push(-1);
  }
  // 839fd0 -> 195570 clears only the final four-lane storage tail. Gaps
  // inserted between groups keep the selector's 1e6 sentinel instead.
  const indexStorage = Float32Array.from({ length: Math.ceil(indices.length / 4) * 4 },
    (_, i) => i >= indices.length ? 0 : indices[i] === -1 ? 1e6 : indices[i]);
  return { indices, indexStorage, layout, decisions, logThreshold };
}
