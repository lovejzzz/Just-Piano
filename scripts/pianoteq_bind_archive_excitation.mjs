import fs from 'node:fs';
import crypto from 'node:crypto';
import {createArchiveExcitationProducer} from '../dsp/archive-excitation-producer.mjs';
import {readFormatZeroNoteOns} from './pianoteq_note_on_velocity_source.mjs';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
export function bindArchiveExcitation(bytes, captureSha256) {
  const source = JSON.parse(bytes);
  if (source.schema !== 'pianoteq-excitation-archive-inputs-v1' ||
      sha(fs.readFileSync(source.resourcePath)) !== source.resourceSha256 ||
      sha(fs.readFileSync(source.presetPath)) !== source.presetSha256)
    throw new Error('Current bound excitation model and preset required');
  const contextBytes = fs.readFileSync(source.contextPath), context = JSON.parse(contextBytes);
  if (sha(contextBytes) !== source.contextSha256 || context.schema !== 'pianoteq-excitation-runtime-context-v1' ||
      context.registryAndCurveModesStillObserved !== true || context.ordinaryScalarModesStillExplicit !== true ||
      context.hostAndInstrumentBranchesStillExplicit !== true || Object.keys(context.sources ?? {}).length !== 11)
    throw new Error('Complete explicit excitation runtime context required');
  // Original observations are provenance, not files needed by the producer.
  // Their extracted explicit context is itself bound above to its exact digest.
  for (const entry of Object.values(context.sources))
    if (typeof entry.path !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error('Explicit observation provenance required');
  const midi = fs.readFileSync(source.midiPath);
  if (sha(midi) !== source.midiSha256) throw new Error('Bound MIDI events required');
  const own = createArchiveExcitationProducer({baseFields: source.baseFields, presetFields: source.presetFields,
    runtime: context.runtime, events: readFormatZeroNoteOns(midi).events});
  return {...own, archiveIdentity: {presetSha256: source.presetSha256, resourceSha256: source.resourceSha256,
    bank: source.bank, bankMd5: source.bankMd5, modelIdentity: source.modelIdentity},
    metadata: {...own.metadata, archiveSourceSha256: sha(bytes), contextSha256: sha(contextBytes), captureSha256,
      originalObservationFilesRequiredByProducer: false,
      eventVelocityMidiSha256: source.midiSha256, crossRunRuntimeObservations: true,
      eventVelocityRuntimeConditionsNewlyObserved: false, hardnessRuntimeConditionsNewlyObserved: false,
      hardnessEditCurvesConsumed: false}};
}
