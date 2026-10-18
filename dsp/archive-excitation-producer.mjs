// Build physical source tables and per-strike excitation in the running chain.
// Registry values, modes and host expression conditions remain explicit dependencies.
import {constructArchiveSourceContext, archiveTunedNote} from './archive-source-context.mjs';
import {prepareArchiveExcitationInitialSources} from './archive-excitation-initial-sources.mjs';
import {archiveHardnessAt69, linearModelCurve} from './model-curves.mjs';
import {buildManagerEventTables, managerEventCurvesFromArchive} from './manager-event-tables.mjs';
import {ExcitationManagerRandom} from './excitation-manager-random.mjs';
import {mapManagerEventValue, randomizeManagerEventValue} from './manager-event-velocity.mjs';
import {archiveExcitationMixCoefficients, mixExcitationComponents} from './excitation-component-mix.mjs';
import {archiveNeighborControls, mixNeighborExcitation} from './excitation-neighbor-controls.mjs';
import {archiveExcitationDecayControls, excitationDecayFromControls, scaleExcitationDecay} from './excitation-decay-controls.mjs';
import {archiveFrequencyVariationControls, secondaryFrequencySeed, varyExcitationFrequencies} from './excitation-frequency-variation.mjs';
import {archiveExcitationBlend} from './archive-excitation-blend.mjs';
import {archiveExcitationHistory} from './archive-excitation-history.mjs';
import {archiveExcitationSpectrum} from './archive-excitation-spectrum.mjs';
import {archiveExcitationExtraTables} from './archive-excitation-extra-tables.mjs';
import {archiveExcitationBaseTables} from './archive-excitation-base-tables.mjs';
import {archiveExcitationControl30} from './archive-excitation-control30.mjs';
import {createMidiRattleTimeline} from './midi-rattle-timeline.mjs';
import {createMidiKeyReleaseTimeline} from './midi-key-release-timeline.mjs';

export function createArchiveExcitationProducer({baseFields, presetFields, runtime, events, eventClock = null}) {
  if (runtime?.note !== 69 || runtime.instrumentMode !== 1 || runtime.hostMode !== 0 ||
      runtime.noteBranch !== 'ordinary' || runtime.configurationSeed !== 0 ||
      runtime.eventBranch !== 'velocity-randomization-enabled' || runtime.useGlobal !== false ||
      runtime.midiNormalization !== 'velocity/128' || runtime.kind !== 0 ||
      !Array.isArray(events) || events.length !== 5 || events.some(e => e.note !== 69 || e.velocity !== 96))
    throw new Error('Explicit supported five-strike A4 archive excitation conditions required');
  if (eventClock && (eventClock.blockSize !== 64 || !Number.isInteger(eventClock.sampleRate) || eventClock.sampleRate <= 0 ||
      eventClock.noteOnFrames?.length !== events.length || eventClock.noteOnFrames.some((v, i, a) =>
        !Number.isSafeInteger(v) || v < 0 || v % 64 || (i && v < a[i - 1]))))
    throw new Error('Complete explicit MIDI block clock required');
  const base = {fields: structuredClone(baseFields)}, preset = {decoded_tail: {fields: structuredClone(presetFields)}};
  const rattleTimeline = eventClock?.events ? createMidiRattleTimeline({events: eventClock.events,
    presetFields: preset.decoded_tail.fields, noteOnFrames: eventClock.noteOnFrames}) : null;
  const keyTimeline = eventClock?.events ? createMidiKeyReleaseTimeline({baseFields: base.fields,
    presetFields: preset.decoded_tail.fields, eventClock}) : null;
  const context = constructArchiveSourceContext({baseFields: base.fields, presetFields: preset.decoded_tail.fields, ...runtime.tuning});
  if (runtime.sourceOptions[0].sampleRate !== runtime.sourceOptions[1].sampleRate) throw new Error('One physical sample rate required');
  const historyModel = archiveExcitationHistory({baseFields: base.fields, note: 69,
    sampleRate: runtime.sourceOptions[0].sampleRate, noteBranch: runtime.noteBranch});
  const hardnessControls = {...historyModel.hardnessControls, fallbackFrequency: archiveTunedNote(context, {note: 69}).frequency};
  const spectrumModel = archiveExcitationSpectrum({baseFields: base.fields, note: 69, noteBranch: runtime.noteBranch});
  const extraTableModel = archiveExcitationExtraTables({baseFields: base.fields, note: 69});
  const sources = prepareArchiveExcitationInitialSources({context, baseFields: base.fields,
    presetFields: preset.decoded_tail.fields, sourceOptions: runtime.sourceOptions, instrumentMode: runtime.instrumentMode, note: 69});
  for (const [mode, source] of sources) {
    if (source.columns !== 3 || source.rows !== (mode === 0 ? 26 : 10) ||
        !source.coupledPolesComputed || !source.archiveRuntimeControlsComputed ||
        source.coupledPoleTraces.some(r => r.rootAlgorithm !== 'recovered-native-cubic-qr'))
      throw new Error('Complete own native-QR coupled source required');
  }
  const curves = managerEventCurvesFromArchive({baseFields: base.fields, presetFields: preset.decoded_tail.fields});
  const baseTableModel = archiveExcitationBaseTables({baseFields: base.fields, note: 69, primarySource: sources.get(0)});
  const control30Model = archiveExcitationControl30({baseFields: base.fields, presetFields: preset.decoded_tail.fields,
    note: 69, rows: sources.get(0).rows});
  extraTableModel.control30 = control30Model.table;
  const eventTable = buildManagerEventTables({...curves, useGlobal: false, runtimeMode: 'linear-clamp'}).noteOn;
  const a = new Map(preset.decoded_tail.fields.map(r => [r.object_offset, r.value]));
  const shape = linearModelCurve(a.get(0xed0), 69, {runtimeMode: 'linear-clamp'});
  if (shape.length !== 1 || !Number.isFinite(a.get(0xec8)) ||
      Math.max(-1, Math.min(1, Math.fround(Math.fround(a.get(0xec8)) + shape[0]))) !== 0)
    throw new Error('Supported zero post-lookup shaping required');
  const hardness = archiveHardnessAt69({baseFields: base.fields, presetFields: preset.decoded_tail.fields, note: 69, runtimeMode: 'linear-clamp'});
  const hardnessCurves = {primary: {knots: [...hardness.knots], values: [...hardness.tables[0]]},
    secondary: {knots: [...hardness.knots], values: [...hardness.tables[1]]}};
  const mixControls = archiveExcitationMixCoefficients(base, 69, {runtimeMode: 'linear-clamp'});
  const neighborControls = archiveNeighborControls(base, 69, {runtimeMode: 'linear-clamp'});
  const decayControls = archiveExcitationDecayControls(base, preset, 69, {runtimeCurveMode: 'linear-clamp'});
  const variationControls = archiveFrequencyVariationControls(base, 69, {instrumentMode: 1, runtimeCurveMode: 'linear-clamp'});
  const manager = new ExcitationManagerRandom({configurationSeed: 0, eventBranch: runtime.eventBranch});
  const velocities = new Map(), blends = new Map(), primaryStates = new Map(), used = new Set(), traces = [];
  const metadata = Object.freeze({sourceTablesConstructedDuringReplay: true, historicalPredictionReportRequired: false,
    nativeSourceArraysUsedAsInput: false, candidateFromArchiveCoupledSource: true,
    candidateNativeRootAlgorithm: 'recovered-native-cubic-qr', candidateSourceRuntimeControlsComputed: true,
    primaryInitialRandomStateIndependentlyProduced: true, primaryRandomStateStillObserved: false,
    eventVelocityComputedFromMidiAndArchive: true, normalHardnessKnotsAndValuesComputedFromArchive: true,
    registryAndCurveModesStillObserved: true, blendControlsStillObserved: false,
    blendControlsFromArchiveAndOwnVelocity: true, blendFloorHostConditionStillExplicit: true,
    hardnessControlsFromArchive: true, supportHistoryControlsFromArchive: true, directionBranchStillExplicit: true,
    spectrumBaseControlsFromArchive: true, spectrumExpressionAndNonzeroSlopeCoverageStillIncomplete: true,
    floorAndBlendSpectrumTablesFromArchive: true, otherSpectrumTablesStillObserved: true,
    control30SpectrumTableFromArchive: true, computedExtraSpectrumTables: ['floor', 'blend', 'control30'],
    oldVoiceCounterComputedFromMidi: Boolean(eventClock), repeatHostRateFromExplicitRender: Boolean(eventClock),
    repeatDurationFromArchive: true,
    rattleSourceValuesFromMidi: Boolean(rattleTimeline), rattleConsumerClockStillObserved: true,
    keyReleaseTimelineFromMidiAndArchive: Boolean(keyTimeline),
    eventClockSampleRate: eventClock?.sampleRate, oldVoiceSelectionStillObserved: true,
    baseSpectrumTablesFromArchiveAndOwnInitialSource: true, spectrumCoordinatesFromArchive: true,
    sameRunModelGenerationVerified: false, wholeEngineEquivalent: false});
  return {
    metadata,
    previousMidiEpoch(epoch) {
      if (!Number.isInteger(epoch) || !events[epoch]) throw new Error('Source MIDI strike epoch required');
      for (let i = epoch - 1; i >= 0; i--)
        if (events[i].note === events[epoch].note && events[i].channel === events[epoch].channel) return i;
      return null;
    },
    keyStateAtConsumerAge(epoch, age) {
      if (!keyTimeline || !Number.isInteger(epoch) || !Number.isSafeInteger(eventClock.noteOnFrames[epoch]) ||
          !Number.isSafeInteger(age) || age < 0 || age % 64) throw new Error('Supported source MIDI key clock required');
      return keyTimeline.stateAtFrame(eventClock.noteOnFrames[epoch] + age);
    },
    initialRattleValue(epoch) {
      if (!rattleTimeline) throw new Error('Source MIDI Rattle timeline required');
      return rattleTimeline.initialValue(epoch);
    },
    rattleValueAtConsumerAge(epoch, age) {
      if (!rattleTimeline) throw new Error('Source MIDI Rattle timeline required');
      return rattleTimeline.valueAtConsumerAge(epoch, age);
    },
    beginVelocity(record) {
      const event = events[record.epoch];
      if (record.stage !== 'before' || record.epoch !== velocities.size || !event || event.note !== record.note)
        throw new Error('Chronological MIDI voice start required');
      const initialization = manager.nextVoice();
      const randomized = randomizeManagerEventValue(Math.fround(event.velocity / 128), initialization.velocityWord, {kind: 0, eligible: true});
      const velocity = mapManagerEventValue(randomized, {kind: 0, table: eventTable});
      velocities.set(record.epoch, {velocity, initialization});
      return velocity;
    },
    velocityForEpoch(epoch) {
      if (!velocities.has(epoch)) throw new Error('Started MIDI voice required');
      return velocities.get(epoch).velocity;
    },
    oldVoiceSampleCount(epoch, oldEpoch) {
      if (!eventClock || !Number.isInteger(epoch) || !Number.isInteger(oldEpoch) || oldEpoch < 0 || oldEpoch >= epoch ||
          !velocities.has(epoch) || !velocities.has(oldEpoch)) throw new Error('Started chronological voices and source MIDI clock required');
      return eventClock.noteOnFrames[epoch] - eventClock.noteOnFrames[oldEpoch];
    },
    repeatDurationForEpoch(epoch) {
      if (!velocities.has(epoch) || !Number.isFinite(historyModel.repeatedFields['0x37c']))
        throw new Error('Started voice and own archive repeat duration required');
      return historyModel.repeatedFields['0x37c'];
    },
    consume(record, {repeat, velocityRuntime} = {}) {
      const {mode, note, header, size, controls} = record.input, key = `${record.epoch}:${mode}`;
      const event = velocities.get(record.epoch), source = sources.get(mode);
      if (!event || !source || note !== 69 || used.has(key) || header?.[0] !== source.columns ||
          header[1] !== source.rows || size !== source.rows * source.columns ||
          !Number.isFinite(repeat?.attenuation) || controls.u !== 0 || controls.hardnessMode !== 0 ||
          record.selectionSource?.sampleRate !== runtime.sourceOptions[mode].sampleRate)
        throw new Error('Own repeated-strike state and complete matching source mode required');
      if (mode === 1 && !used.has(`${record.epoch}:0`)) throw new Error('Primary source must precede secondary');
      if (velocityRuntime?.hostMode !== runtime.hostMode) throw new Error('Consistent explicit host mode required');
      const blend = archiveExcitationBlend({baseFields: base.fields, presetFields: preset.decoded_tail.fields,
        velocity: event.velocity, velocityRuntime});
      if (blends.has(record.epoch) && blends.get(record.epoch).blendFloor !== blend.blendFloor)
        throw new Error('One expression condition per paired source required');
      blends.set(record.epoch, blend);
      const mix = mixExcitationComponents({amplitude: source.normalizedAmplitude, columns: source.columns,
        ...mixControls, velocity: event.velocity, attenuation: repeat.attenuation,
        blendFloor: blend.blendFloor, inputBlend: blend.inputBlend});
      const neighbor = mixNeighborExcitation({amplitude: mix.amplitude, phase: source.phase, columns: source.columns},
        {...neighborControls, floor: blend.blendFloor, blend: blend.inputBlend,
          mix: Math.max(blend.blendFloor, blend.inputBlend)});
      const decayModel = excitationDecayFromControls(decayControls, event.velocity, {hostMode: 0, noteBranch: 'ordinary'});
      const variation = varyExcitationFrequencies({frequency: source.frequency, columns: source.columns,
        spread: mode === 0 ? variationControls.primarySpread : variationControls.secondarySpread,
        offset: mode === 0 ? 0 : variationControls.secondaryOffset,
        randomState: mode === 0 ? event.initialization.voiceState : secondaryFrequencySeed(note)});
      if (mode === 0) primaryStates.set(record.epoch, [...variation.randomState]);
      used.add(key); traces.push({epoch: record.epoch, mode, attenuation: repeat.attenuation,
        velocity: event.velocity, randomDraws: variation.randomDraws, randomState: [...variation.randomState],
        decayGain: decayModel.gain, ...structuredClone(blend)});
      return {frequency: Array.from(variation.frequency), decay: Array.from(scaleExcitationDecay(source.decay, decayModel.gain)),
        amplitude: Array.from(neighbor.amplitude), phase: Array.from(neighbor.phase)};
    },
    primaryRandomState(record) {
      if (record.input.mode !== 0 || !used.has(`${record.epoch}:0`)) throw new Error('Consumed primary source required');
      return [...primaryStates.get(record.epoch)];
    },
    hardnessCurves(record) {
      if (!used.has(`${record.epoch}:${record.input.mode}`)) throw new Error('Consumed source required');
      return structuredClone(hardnessCurves);
    },
    blendControls(record) {
      if (!used.has(`${record.epoch}:${record.input.mode}`)) throw new Error('Consumed source required');
      return structuredClone(blends.get(record.epoch));
    },
    hardnessControls(record) {
      if (!used.has(`${record.epoch}:${record.input.mode}`)) throw new Error('Consumed source required');
      return {...hardnessControls};
    },
    supportHistoryControls(record) {
      if (!used.has(`${record.epoch}:${record.input.mode}`)) throw new Error('Consumed source required');
      return structuredClone(historyModel);
    },
    spectrumControls(record) {
      if (!used.has(`${record.epoch}:${record.input.mode}`)) throw new Error('Consumed source required');
      return structuredClone(spectrumModel);
    },
    extraTables(record) {
      if (!used.has(`${record.epoch}:${record.input.mode}`)) throw new Error('Consumed source required');
      return structuredClone(extraTableModel);
    },
    baseTables(record) {
      if (!used.has(`${record.epoch}:${record.input.mode}`)) throw new Error('Consumed source required');
      const count = sources.get(record.input.mode).rows;
      return {negative: baseTableModel.negative.slice(0, count), positive: baseTableModel.positive.slice(0, count),
        coordinates: [...baseTableModel.coordinates]};
    },
    verifyComplete() {
      if (velocities.size !== 5 || used.size !== 10 || manager.starts !== 5 || manager.draws !== 10)
        throw new Error('Complete five-start two-mode source computation required');
      return used.size;
    },
    audit() { return {traces: structuredClone(traces), managerDraws: manager.draws, historyModel: structuredClone(historyModel), spectrumModel: structuredClone(spectrumModel), extraTableModel: structuredClone(extraTableModel), baseTableModel: structuredClone(baseTableModel),
      hardnessControls: {...hardnessControls}, sourceBuilds: [...sources].map(([mode, s]) =>
      ({mode, rows: s.rows, columns: s.columns, referenceIndex: s.referenceIndex, coupledRows: s.coupledPoleTraces.length}))}; },
  };
}
