// Construct both initial caches from one immutable archive context. Registry,
// instrument and phase options remain explicit; no observed source array enters.
import {prepareArchiveSourceTables} from './archive-source-context.mjs';
export function prepareArchiveExcitationInitialSources({context, baseFields, presetFields, sourceOptions, instrumentMode, note}) {
  if (!Number.isInteger(note) || note < 1 || note > 127 || !sourceOptions?.[0] || !sourceOptions?.[1] ||
      !Number.isFinite(sourceOptions[0].sampleRate) || sourceOptions[0].sampleRate <= 0 ||
      sourceOptions[0].sampleRate !== sourceOptions[1].sampleRate)
    throw new Error('Integer note and two explicit matching physical sample rates required');
  const presetGrid = presetFields?.find(r => r.object_offset === 0x9a8)?.value?.grid;
  const baseGrid = baseFields?.find(r => r.object_offset === 0x1018)?.value?.rows;
  if (!Array.isArray(presetGrid) || !Array.isArray(baseGrid)) throw new Error('Complete archive harmonic grids required');
  return new Map([0, 1].map(mode => {
    const options = structuredClone(sourceOptions[mode]);
    if (options.instrumentMode !== instrumentMode || options.impedanceRuntime?.mode !== mode ||
        !options.weightSource?.harmonicCurveMode || options.weightSource.harmonicCurveModes !== undefined)
      throw new Error('Explicit matching mode and harmonic curve conditions required');
    options.weightSource.harmonicCurveModes = {
      preset: presetGrid.map(() => options.weightSource.harmonicCurveMode),
      base: baseGrid.map(() => options.weightSource.harmonicCurveMode)};
    delete options.weightSource.harmonicCurveMode;
    const source = prepareArchiveSourceTables(context, {...options, note, noteIndex: note});
    if (!source.archivePhysicalSourceComputed || !source.archiveRuntimeControlsComputed || !source.archiveSpectrumComputed)
      throw new Error('Complete archive physical source construction required');
    return [mode, source];
  }));
}
