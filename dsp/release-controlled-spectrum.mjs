// Connect independently computed repeated-strike controls to excitation tables.
// Model tables/curves and other controls are supplied sources, never native outputs.
import {excitationHardness} from './excitation-hardness.mjs';
import {nativeScalarCos} from './native-scalar-sin.mjs';
import {excitationSpectrumControls, excitationExtraTable} from './excitation-spectrum-controls.mjs';
import {buildLogSpectrum} from './excitation-spectrum.mjs';

export function buildReleaseControlledSpectrum({input, repeat, controls, count,
 coordinates, baseTable, extraTables, extraControls}, math = {}) {
 const hardness = excitationHardness({...input, controls: {...input.controls,
  repeatFlag: repeat.repeatFlag, age: repeat.age, attenuation: repeat.attenuation}},
  {cosf: nativeScalarCos});
 const spectrumControls = excitationSpectrumControls(hardness,
  {...controls, repeatFlag: repeat.repeatFlag}, math);
 const extraTable = excitationExtraTable({count, tables: extraTables, controls: extraControls}, math);
 const logSpectrum = buildLogSpectrum({...spectrumControls, count, coordinates, baseTable, extraTable});
 return {hardness, controls: spectrumControls, extraTable, logSpectrum};
}
