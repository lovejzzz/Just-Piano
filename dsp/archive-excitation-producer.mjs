// Build physical source tables and per-strike excitation in the running chain.
// Registry values, modes and blend controls remain explicit dependencies.
import {constructArchiveSourceContext, prepareArchiveSourceTables, archiveTunedNote} from './archive-source-context.mjs';
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

export function createArchiveExcitationProducer({baseFields, presetFields, runtime, events}) {
  if (runtime?.note !== 69 || runtime.instrumentMode !== 1 || runtime.hostMode !== 0 ||
      runtime.noteBranch !== 'ordinary' || runtime.configurationSeed !== 0 ||
      runtime.eventBranch !== 'velocity-randomization-enabled' || runtime.useGlobal !== false ||
      runtime.midiNormalization !== 'velocity/128' || runtime.kind !== 0 ||
      !Array.isArray(events) || events.length !== 5 || events.some(e => e.note !== 69 || e.velocity !== 96))
    throw new Error('Explicit supported five-strike A4 archive excitation conditions required');
  const base = {fields: structuredClone(baseFields)}, preset = {decoded_tail: {fields: structuredClone(presetFields)}};
  const context = constructArchiveSourceContext({baseFields: base.fields, presetFields: preset.decoded_tail.fields, ...runtime.tuning});
  if (runtime.sourceOptions[0].sampleRate !== runtime.sourceOptions[1].sampleRate) throw new Error('One physical sample rate required');
  const historyModel = archiveExcitationHistory({baseFields: base.fields, note: 69,
    sampleRate: runtime.sourceOptions[0].sampleRate, noteBranch: runtime.noteBranch});
  const hardnessControls = {...historyModel.hardnessControls, fallbackFrequency: archiveTunedNote(context, {note: 69}).frequency};
  const sources = new Map([0, 1].map(mode => {
    const options = structuredClone(runtime.sourceOptions[mode]);
    if (options.instrumentMode !== runtime.instrumentMode || options.impedanceRuntime?.mode !== mode ||
        !options.weightSource?.harmonicCurveMode || options.weightSource.harmonicCurveModes !== undefined)
      throw new Error('Explicit matching mode and harmonic curve conditions required');
    const presetGrid = preset.decoded_tail.fields.find(r => r.object_offset === 0x9a8)?.value?.grid;
    const baseGrid = base.fields.find(r => r.object_offset === 0x1018)?.value?.rows;
    if (!Array.isArray(presetGrid) || !Array.isArray(baseGrid)) throw new Error('Complete archive harmonic grids required');
    options.weightSource.harmonicCurveModes = {preset: presetGrid.map(() => options.weightSource.harmonicCurveMode),
      base: baseGrid.map(() => options.weightSource.harmonicCurveMode)};
    delete options.weightSource.harmonicCurveMode;
    const source = prepareArchiveSourceTables(context, {...options, note: 69, noteIndex: 69});
    if (source.columns !== 3 || source.rows !== (mode === 0 ? 26 : 10) ||
        !source.coupledPolesComputed || !source.archiveRuntimeControlsComputed ||
        source.coupledPoleTraces.some(r => r.rootAlgorithm !== 'recovered-native-cubic-qr'))
      throw new Error('Complete own native-QR coupled source required');
    return [mode, source];
  }));
  const curves = managerEventCurvesFromArchive({baseFields: base.fields, presetFields: preset.decoded_tail.fields});
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
    sameRunModelGenerationVerified: false, wholeEngineEquivalent: false});
  return {
    metadata,
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
    verifyComplete() {
      if (velocities.size !== 5 || used.size !== 10 || manager.starts !== 5 || manager.draws !== 10)
        throw new Error('Complete five-start two-mode source computation required');
      return used.size;
    },
    audit() { return {traces: structuredClone(traces), managerDraws: manager.draws, historyModel: structuredClone(historyModel),
      hardnessControls: {...hardnessControls}, sourceBuilds: [...sources].map(([mode, s]) =>
      ({mode, rows: s.rows, columns: s.columns, referenceIndex: s.referenceIndex, coupledRows: s.coupledPoleTraces.length}))}; },
  };
}
