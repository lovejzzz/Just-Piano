// Validated private IR pack. Commercial samples remain outside the repository.

const HEAD_LENGTH = 64;
const TAIL_LENGTH = 512;

function entryMap(entries, kind, length) {
  if (!Array.isArray(entries)) throw new Error(`IR pack ${kind} entries required`);
  const result = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.key !== 'string' ||
        !Number.isInteger(entry.ring) || entry.ring < 0 ||
        !Array.isArray(entry.values) || entry.values.length !== length ||
        entry.values.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid ${kind} IR pack entry`);
    }
    if (result.has(entry.key)) throw new Error(`Duplicate ${kind} IR pack key`);
    result.set(entry.key, Float32Array.from(entry.values));
  }
  return result;
}

export function readIrPack(pack) {
  if (pack?.schema !== 1) throw new Error('Unsupported IR pack schema');
  const head = entryMap(pack.head, 'head', HEAD_LENGTH);
  const tail = entryMap(pack.tail, 'tail', TAIL_LENGTH);
  if (head.size !== 144 || tail.size !== 121) {
    throw new Error('IR pack must contain 144 head and 121 tail kernels');
  }
  return {head, tail};
}

export function applyIrPack(config, pack, kind) {
  if (!['head', 'tail'].includes(kind)) throw new RangeError('IR pack kind must be head or tail');
  const entries = readIrPack(pack)[kind];
  let ordinal = 0;
  let applied = 0;
  for (const [ringIndex, ring] of (config.kernels ?? []).entries()) {
    if (!ring) continue;
    for (const [slotIndex, slot] of ring.slots.entries()) {
      const key = kind === 'head' ? `${ringIndex}:${slotIndex}` : `${ringIndex}:${ordinal}`;
      ordinal++;
      if (slot.empty) continue;
      const values = entries.get(key);
      if (!values) throw new Error(`Missing ${kind} IR pack kernel ${key}`);
      const size = kind === 'head' ? HEAD_LENGTH : TAIL_LENGTH;
      slot.timeInput = new Float32Array(size * 2);
      slot.timeInput.set(values);
      slot.content = 1;
      applied++;
    }
  }
  if (applied !== entries.size) throw new Error(`Unused ${kind} IR pack kernels`);
  return applied;
}
