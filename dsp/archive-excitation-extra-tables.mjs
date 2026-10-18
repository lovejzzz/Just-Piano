// Ordinary floor/blend spectrum tables: blend note curves, sample integer
// harmonics with boundary mode 0, then remove the exact zero suffix.
import {archiveHistoryCurve} from './archive-excitation-history.mjs';
import {compactScalarCurve} from './post-excitation.mjs';
export function sampleExcitationExtraCurve(curve) {
  if (curve?.dimension !== 1 || curve.log_x !== 0 || curve.special_mode !== 0 ||
      !Array.isArray(curve.x) || !curve.x.length || curve.x.length !== curve.y?.length ||
      ![...curve.x, ...curve.y].every(v => Number.isFinite(v) && Number.isFinite(Math.fround(v))))
    throw new Error('Complete nonempty ordinary spectrum curve required');
  const x = curve.x.map(Math.fround), count = Math.ceil(x.at(-1));
  if (x.some((v, i) => i && v <= x[i - 1]) || !Number.isInteger(count) || count < 0 || count >= 1000)
    throw new Error('Bounded increasing spectrum coordinates required');
  const result = Array.from({length: count}, (_, i) => {
    const harmonic = i + 1;
    // Unlike the clamped post-excitation curve, mode 0 returns zero outside.
    return harmonic < x[0] || (x.length > 1 && harmonic > x.at(-1)) ? 0 : compactScalarCurve(curve, harmonic);
  });
  while (result.length && result.at(-1) === 0) result.pop();
  return result;
}
export function archiveExcitationExtraTables({baseFields, note}) {
  if (!Number.isInteger(note) || note < 0 || note > 127) throw new Error('Integer MIDI note required');
  return Object.fromEntries([['floor', 0x1a20], ['blend', 0x1a50]].map(([name, offset]) => {
    const rows = baseFields?.filter(r => r.object_offset === offset);
    if (rows?.length !== 1) throw new Error('Unique spectrum curve list required');
    return [name, sampleExcitationExtraCurve(archiveHistoryCurve(rows[0].value, note))];
  }));
}
