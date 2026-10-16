// Append and repeated-strike stages following the independently computed spectrum.
// exp2f/log10f are explicit platform dependencies, not silently approximated here.
import {selectSupportRows, supportLogAmplitudes, appendExcitationSupport,
 appendSecondExcitationSupport} from './excitation-append.mjs';
import {randomizeRepeatedExcitation, updateRepeatedSupportHistory} from './excitation-repeat.mjs';

export function buildReleaseControlledSupport({input, repeat, spectrum, append,
 coordinates, baseTable, extraControls, randomState, randomScale, history,
 historyCurve, historyControls, secondFamilyEnabled}, math) {
 const {header, source: preWeightSource} = input;
 const indices = input.mode === 0 && extraControls.direction === 0
  ? selectSupportRows({header, source: preWeightSource, frequencies: append.tables.frequencies,
    referenceFrequency: append.referenceFrequencies[0]}) : [];
 const logAmplitudes = supportLogAmplitudes({primary: spectrum.hardness.primary,
  spectrum: spectrum.controls, coordinates, baseTable, indices,
  tables: append.tables, logOffset: append.controls.logOffset});
 const controls = {...append.controls, repeatFlag: repeat.repeatFlag, attenuation: repeat.attenuation};
 let result = appendExcitationSupport({...append, controls, header,
  source: spectrum.weightedSource, coordinates, indices, logAmplitudes});
 let state = randomState ? [...randomState] : null, values = [...history];
 let randomDraws = 0, historyUpdates = 0;
 if (repeat.repeatFlag === 1 && repeat.attenuation > 0) {
  if (!state) throw new Error('Active repeated excitation requires an initial random state');
  const varied = randomizeRepeatedExcitation({amplitude: result.source.amplitude,
   columns: header[0], baseRows: header[1], randomState: state,
   controls: {repeatFlag: repeat.repeatFlag, attenuation: repeat.attenuation, scale: randomScale}});
  result.source.amplitude = varied.amplitude; state = varied.randomState; randomDraws += varied.randomDraws;
  if (input.mode === 0 && result.appended) {
   const updated = updateRepeatedSupportHistory({amplitude: result.source.amplitude,
    frequency: result.source.frequency, columns: header[0], baseRows: header[1], history: values,
    count: Math.min(result.appended, 16), randomState: state, curve: historyCurve,
    controls: {...historyControls, attenuation: repeat.attenuation}}, math);
   result.source.amplitude = updated.amplitude; state = updated.randomState; values = updated.history;
   randomDraws += updated.randomDraws; historyUpdates++;
  }
 }
 let secondIndices = [], secondLogAmplitudes = [];
 if (secondFamilyEnabled) {
  secondIndices = selectSupportRows({header, source: preWeightSource,
   frequencies: append.tables.secondFrequencies, referenceFrequency: append.secondReferenceFrequencies[0]});
  secondLogAmplitudes = supportLogAmplitudes({primary: spectrum.hardness.primary,
   spectrum: spectrum.controls, coordinates, baseTable, indices: secondIndices,
   tables: {lowLog: append.tables.secondLowLog, highLog: append.tables.secondHighLog}, logOffset: 0});
  result = appendSecondExcitationSupport(result, {...append, controls, coordinates, secondIndices, secondLogAmplitudes});
 }
 return {...result, indices, logAmplitudes, secondIndices, secondLogAmplitudes,
  randomState: state, history: values, randomDraws, historyUpdates};
}
