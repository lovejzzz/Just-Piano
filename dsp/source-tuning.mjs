// 4a0538 / 96251c / 4c37e0 / 8a3650. Platform math and the separately
// generated stretch table remain explicit inputs; no target values are embedded.
import { impedancePhaseCurve } from './modal-impedance.mjs';
const fl = Math.fround;

export function equalTemperamentBase(note, tuning, math) {
  if (!Number.isInteger(note) || note < 0 || note > 127 || tuning.kind !== 1 ||
      tuning.controls[0] !== 1 || tuning.controls[1] !== 0 || tuning.values.length !== 12 ||
      !tuning.values.every((value, i) => value === (i + 1) * 100) ||
      tuning.midi.map.length || tuning.midi.flag !== 70 ||
      tuning.midi.notes[0] !== 60 || tuning.midi.notes[1] !== 69)
    throw new RangeError('Only the verified default equal-temperament mapping is implemented');
  if (typeof math?.exp2f !== 'function') throw new TypeError('Native exp2f dependency required');
  const referenceHz = fl(tuning.midi.float);
  const referenceCents = fl((tuning.midi.notes[1] - tuning.midi.notes[0]) * 100);
  const root = fl(referenceHz * math.exp2f(fl(referenceCents / -1200)));
  const cents = fl((note - tuning.midi.notes[0]) * 100);
  return fl(root * math.exp2f(fl(cents / 1200)));
}

export function stretchFrequency({ note, noteIndex, baseFrequency, stretchTable,
  modelReferenceHz, registryPitchScale, registryReferenceNote }, math) {
  if (!Number.isInteger(noteIndex) || !(stretchTable[noteIndex] > 0) ||
      ![note, baseFrequency, modelReferenceHz, registryPitchScale, registryReferenceNote].every(Number.isFinite) ||
      baseFrequency <= 0 || modelReferenceHz <= 0)
    throw new RangeError('Explicit positive stretch-table inputs required');
  if (typeof math?.exp2 !== 'function' || typeof math?.exp2f !== 'function')
    throw new TypeError('Native exp2 and exp2f dependencies required');
  note = fl(note);
  const delta = fl(fl(note - fl(noteIndex)) / 12);
  const tableScaled = fl(fl(stretchTable[noteIndex]) * math.exp2f(delta));
  const numerator = fl(tableScaled * registryPitchScale);
  const denominator = fl(math.exp2((note - registryReferenceNote) / 12) * fl(modelReferenceHz));
  const factor = fl(numerator / denominator);
  return { factor, frequency: fl(fl(baseFrequency) * factor), numerator, denominator };
}

export function anchorFrequencyScale(target, anchor, registryMultiplier) {
  if (![target, anchor, registryMultiplier].every(Number.isFinite) || target <= 0 || anchor <= 0)
    throw new RangeError('Explicit anchor frequency and registry multiplier required');
  return fl(registryMultiplier * fl(fl(target) / fl(anchor)));
}

export function finishTuning({ note, baseFrequency, stretchedFrequency, anchorScale,
  modelReferenceHz, pitchCurve, runtimeCurveMode, ageing }, math) {
  if (ageing !== 0) throw new RangeError('Ageing detune needs additional seeded state');
  const relative = fl(fl(note - 69) / 12);
  const initialRatio = fl(fl(baseFrequency) / (math.exp2(relative) * fl(modelReferenceHz)));
  const phase = impedancePhaseCurve({ ...pitchCurve, ...runtimeCurveMode }, note);
  const editScale = fl(math.exp2f(fl(phase / 1200)));
  return { baseline: fl(baseFrequency), anchored: fl(fl(stretchedFrequency) * fl(anchorScale)),
    initialRatio,
    referenceRatio: fl(initialRatio * fl(anchorScale)),
    frequency: fl(fl(fl(stretchedFrequency) * fl(anchorScale)) * editScale), editScale };
}
