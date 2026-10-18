import { fma32 } from './modal-kernel.mjs';

// 51fc9c..51fd20: per-voice mono -> per-key slot and global mono lanes.
// 898144..898154: ordered per-key slot -> first modal source.
export function accumulateKeyMono64(contributors) {
  const slots = new Map();
  const lanes = Array.from({ length: 3 }, () => new Float32Array(64));
  for (const item of contributors) {
    const { keyIndex, mixLevels, monoContribution: source } = item;
    if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex >= 128 || mixLevels?.length !== 4 ||
        source?.length !== 64 || ![...mixLevels, ...source].every(Number.isFinite))
      throw Error('Bound complete mono contributor required');
    const gain = mixLevels[0];
    if (gain !== 0) {
      if (!slots.has(keyIndex)) slots.set(keyIndex, Float32Array.from(source, x => Math.fround(x * gain)));
      else {
        const slot = slots.get(keyIndex);
        for (let i = 0; i < 64; i++) slot[i] = fma32(source[i], gain, slot[i]);
      }
    }
    for (let row = 0; row < 3; row++) {
      const level = mixLevels[row + 1];
      if (level !== 0) for (let i = 0; i < 64; i++) lanes[row][i] = fma32(source[i], level, lanes[row][i]);
    }
  }
  const firstModal = new Float32Array(64);
  for (const key of [...slots.keys()].sort((a, b) => a - b)) {
    const slot = slots.get(key);
    for (let i = 0; i < 64; i++) firstModal[i] = Math.fround(firstModal[i] + slot[i]);
  }
  return { firstModal, secondModal: lanes[0], thirdModal: lanes[1], direct: lanes[2], slots };
}
