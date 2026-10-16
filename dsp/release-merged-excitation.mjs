// Post-process the computed primary, merge the computed secondary, then vary phases.
// The remaining double pow dependency is explicit; source snapshots are not targets.
import {postExcitationTables} from './post-excitation.mjs';
import {mergeExcitationSources, varyExcitationPhases} from './final-excitation.mjs';
const padded = amplitude => {const values = Array.from(amplitude);while(values.length % 4)values.push(0);return values;};
export function mergeReleaseExcitation({primary, secondary, postInputs, controls, randomState}, math) {
 const post = postExcitationTables({...postInputs, source: primary.source,
  amplitudeStorage: padded(primary.source.amplitude), columns: primary.header[0]}, math);
 const primaryHeader = [...primary.header];primaryHeader[1] = post.rows;
 primaryHeader[6] = primary.header[1];primaryHeader[7] = post.rows;
 const merged = mergeExcitationSources({primary: post.source, primaryHeader,
  secondary: secondary.source, secondaryHeader: secondary.header,
  secondaryStorage: padded(secondary.source.amplitude), controls});
 const phased = varyExcitationPhases({frequency: merged.source.frequency, phase: merged.source.phase,
  columns: merged.header[0], phaseSpread: controls.phaseSpread, timeSpread: controls.timeSpread,
  phaseStartRow: controls.phaseStartRow, randomState});
 return {header: merged.header, source: {...merged.source, phase: phased.phase},
  randomState: phased.randomState, phaseRandomDraws: phased.randomDraws, post,
  secondaryNormalizationGain: merged.secondaryNormalizationGain, secondaryNorm: merged.secondaryNorm};
}
