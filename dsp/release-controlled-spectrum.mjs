// Connect independently computed repeated-strike controls to excitation tables.
// Model tables/curves and other controls are supplied sources, never native outputs.
import {excitationHardness} from './excitation-hardness.mjs';
import {nativeScalarCos} from './native-scalar-sin.mjs';
import {excitationSpectrumControls, excitationExtraTable} from './excitation-spectrum-controls.mjs';
import {buildLogSpectrum, nativeExpWeights, applyModalWeight} from './excitation-spectrum.mjs';

export function buildReleaseControlledSpectrum({input, repeat, controls, count,
 coordinates, baseTable, baseTables, extraTables, extraControls}, math = {}) {
 const hardness = excitationHardness({...input, controls: {...input.controls,
  repeatFlag: repeat.repeatFlag, age: repeat.age, attenuation: repeat.attenuation}},
  {cosf: nativeScalarCos});
 const spectrumControls = excitationSpectrumControls(hardness,
  {...controls, repeatFlag: repeat.repeatFlag}, math);
 if (baseTables) {
  if (baseTable !== undefined || !['negative', 'positive'].every(k =>
    baseTables[k]?.length === count && baseTables[k].every(Number.isFinite)))
   throw new RangeError('Complete own base tables without captured fallback required');
  baseTable = baseTables[spectrumControls.slope > 0 ? 'positive' : 'negative'];
 }
 const extraTable = excitationExtraTable({count, tables: extraTables, controls: extraControls}, math);
 const logSpectrum = buildLogSpectrum({...spectrumControls, count, coordinates, baseTable, extraTable});
 const [columns, rows] = input.header;
 if (![1, 2, 3].includes(columns) || rows !== count ||
     Object.values(input.source).some(a => a.length !== rows * columns))
  throw new RangeError('Complete pre-weight modal source required');
 const expWeights = nativeExpWeights(logSpectrum);
 const weightedSource = Object.fromEntries(Object.entries(input.source).map(([key, values]) =>
  [key, Float32Array.from(values)]));
 weightedSource.amplitude = Float32Array.from(input.source.amplitude,
  (amplitude, i) => applyModalWeight(amplitude, expWeights[Math.floor(i / columns)]));
 return {hardness, controls: spectrumControls, baseTable, extraTable, logSpectrum, expWeights, weightedSource};
}
