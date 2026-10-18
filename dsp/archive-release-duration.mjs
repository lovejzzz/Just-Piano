// Compose existing archive stiffness, stretch and tuning producers. Runtime
// registry constants/modes and branch choices remain explicit, not inferred.
import {sourceArchiveInputs, sourceStiffnessCents} from './source-controls.mjs';
import {nativeSourceMath} from './native-source-math.mjs';
import {archiveStretchControls} from './stretch-rhs.mjs';
import {constructStretchTable} from './construct-stretch-table.mjs';
import {equalTemperamentBase, stretchFrequency, anchorFrequencyScale, finishTuning} from './source-tuning.mjs';
import {archiveDampingDuration} from './archive-damping-duration.mjs';

const f = Math.fround;
function field(rows, offset) {
  const found = rows?.filter(r => r.object_offset === offset);
  if (found?.length !== 1) throw new Error('Unique release-duration archive field required: ' + offset.toString(16));
  return found[0].value;
}
export function constructArchiveDurationTuning(source) {
  const {baseFields, editFields, tuningRuntime: runtime} = source;
  if (source.schema !== 'pianoteq-duration-archive-inputs-v2' || !runtime ||
      runtime.ageing !== 0 || field(editFields, 0x1398) !== 0 ||
      runtime.specialInstrument !== 0 || runtime.voiceVariationEnabled !== 0 ||
      ![runtime.middleWeight, runtime.gramScale, runtime.registryPitchScale,
        runtime.registryReferenceNote, runtime.anchorRegistryMultiplier].every(Number.isFinite))
    throw new Error('Explicit supported tuning and duration runtime branches required');
  const input = sourceArchiveInputs(baseFields, editFields);
  const stiffnessTable = Array.from({length: 128}, (_, note) =>
    nativeSourceMath.exp2(sourceStiffnessCents(input, note, runtime.sourceCurveModes, nativeSourceMath).cents / 600) - 1);
  const controls = archiveStretchControls(baseFields, editFields, runtime.stretchCurveMode);
  const stretch = constructStretchTable({controls, stiffnessTable,
    middleWeight: runtime.middleWeight, gramScale: runtime.gramScale});
  const tuning = field(editFields, 0x318), modelReferenceHz = field(baseFields, 0x1b34);
  const prepared = Array.from({length: 128}, (_, note) => {
    const baseline = equalTemperamentBase(note, tuning, nativeSourceMath);
    return {note, baseline, stretch: stretchFrequency({note, noteIndex: note, baseFrequency: baseline,
      stretchTable: stretch.table, modelReferenceHz, registryPitchScale: runtime.registryPitchScale,
      registryReferenceNote: runtime.registryReferenceNote}, nativeSourceMath)};
  });
  const anchorScale = anchorFrequencyScale(tuning.midi.float, prepared[69].stretch.frequency, runtime.anchorRegistryMultiplier);
  const sources = prepared.map(p => ({...p, output: finishTuning({note: p.note, baseFrequency: p.baseline,
    stretchedFrequency: p.stretch.frequency, anchorScale, modelReferenceHz,
    pitchCurve: field(editFields, 0x3b0), runtimeCurveMode: runtime.pitchCurveMode,
    ageing: runtime.ageing}, nativeSourceMath)}));
  return {sources, stiffnessTable, stretchTable: stretch.table, anchorScale,
    registryAndCurveModesStillObserved: true, frequencyTargetUsedAsInput: false};
}

export function archiveReleaseDuration(source, tuning, note) {
  if (!Number.isInteger(note) || note < 0 || note > 127 ||
      tuning?.sources?.length !== 128 || tuning.frequencyTargetUsedAsInput !== false)
    throw new Error('Own complete tuning producer and integer note required');
  const getter = archiveDampingDuration({...source, note});
  if (getter.conditionActive || source.tuningRuntime.specialInstrument !== 0 || source.tuningRuntime.voiceVariationEnabled !== 0)
    throw new Error('Unverified duration variation/instrument branch');
  const frequency = tuning.sources[note].output.frequency;
  if (!Number.isFinite(frequency) || frequency <= 0) throw new Error('Positive own source frequency required');
  const minimum = f(2 / frequency), sourceDuration = Math.max(getter.duration, minimum);
  return {note, getterDuration: getter.duration, frequency, minimum, sourceDuration,
    duration: Math.min(15, Math.max(f(.01), sourceDuration)), frequencyStillObserved: false,
    registryAndCurveModesStillObserved: true, runtimeBranchesStillExplicit: true};
}
