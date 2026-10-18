// Compose independently advanced state blocks with explicit observation groups.
// Construction of the matrices and observation groups is a separate boundary.
import {runSoundboardCompute} from './soundboard-block.mjs';
import {applySoundboardOutputKernel} from './soundboard-output-kernel.mjs';

export function computeSoundboardResponses({propagation, observations}) {
  if (!propagation || propagation.onBlock !== undefined) {
    throw new RangeError('Propagation inputs without an external block observer required');
  }
  if (!Array.isArray(observations) || !observations.length) {
    throw new RangeError('At least one observation channel required');
  }
  const outputs = observations.map((observation) => {
    if (!Number.isInteger(observation.length) || observation.length < 65 ||
        !Array.isArray(observation.groups) || !observation.groups.length) {
      throw new RangeError('Observation length and nonempty groups required');
    }
    return new Float32Array(observation.length);
  });
  let blockCount = 0;
  const result = runSoundboardCompute({...propagation, onBlock(cache, start) {
    const blocks = Array.from({length: propagation.matrixA.length}, (_, i) =>
      cache.subarray(i * 65, (i + 1) * 65));
    for (let channel = 0; channel < observations.length; channel++) {
      for (const record of observations[channel].groups) {
        applySoundboardOutputKernel(record, blocks, outputs[channel], start);
      }
    }
    blockCount++;
  }});
  for (const output of outputs) {
    if (output.some((value) => !Number.isFinite(value))) {
      throw new RangeError('Non-finite soundboard response');
    }
  }
  return {...result, outputs, blockCount, nativeBlockCacheUsed: false,
    observationGroupsConstructedFromModel: false};
}
