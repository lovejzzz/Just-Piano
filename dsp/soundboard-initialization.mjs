import {constructSoundboardGrid} from './soundboard-grid.mjs';
import {constructSoundboardExcitation} from './soundboard-excitation.mjs';

// Observed ARM64 configuration layout. Bytes contain configuration, not state arrays.
export function initializeSoundboardFromConfig(bytes, bridge) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 0x130) throw new RangeError('Complete soundboard configuration required');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), get = (offset) => view.getFloat32(offset, true);
  const grid = constructSoundboardGrid({sampleRate: get(0x24), method: get(0x28), width: get(0x30), height: get(0x38),
    propagation: get(0x84), stability0: get(0x98), stability1: get(0x9c), boundary0: get(0x90), boundary1: get(0x94),
    sourcePosition: get(0x80), bridge});
  const amplitude = Math.fround(get(0x8c) * Math.fround(get(0x98) + get(0x9c))), width = get(0xe8);
  const excitation = constructSoundboardExcitation(grid, {amplitude, width});
  return {grid, excitation, excitationParameters: [amplitude, width]};
}
