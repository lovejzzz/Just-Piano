// SoundboardIRCompute output layout. The nine generated node buffers each hold
// 1024 head floats followed by tail windows; rings 2..8 also expose one short
// tail window padded to 512 floats.

const HEAD_FLOATS = 1024;
const HEAD_WINDOW = 64;
const HEAD_SLOTS = HEAD_FLOATS / HEAD_WINDOW;
const TAIL_WINDOW = 512;
const HEAD_RING_ORDER = [8, 0, 1, 2, 3, 4, 5, 6, 7];
const FULL_TAIL_WINDOWS = [14, 14, 14, 12, 12, 12, 12, 12, 12];
const SHORT_TAIL_WINDOWS = [0, 0, 1, 1, 1, 1, 1, 1, 1];
// Native tail keys use a global ordinal. Ring 0 reserves one ordinal for an
// omitted short window, so ring 1 begins at 16 rather than 15.
const TAIL_ORDINAL_SPAN = [15, 14, 15, 13, 13, 13, 13, 13, 13];
const OMITTED_SHORT_ORDINALS = [1, 0, 0, 0, 0, 0, 0, 0, 0];

function checkedNode(node, ring) {
  if (!(node instanceof Float32Array) || node.length < HEAD_FLOATS) {
    throw new RangeError(`Node ${ring} must contain at least ${HEAD_FLOATS} float32 values`);
  }
  if (node.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`Node ${ring} contains a non-finite value`);
  }
  const required = HEAD_FLOATS + FULL_TAIL_WINDOWS[ring] * TAIL_WINDOW +
    (SHORT_TAIL_WINDOWS[ring] ? 1 : 0);
  if (node.length < required) {
    throw new RangeError(`Node ${ring} is too short: ${node.length} < ${required}`);
  }
  return node;
}

function valuesAt(node, offset, length) {
  return Array.from(node.subarray(offset, offset + length));
}

export function soundboardIrSlots(nodeInput) {
  if (!Array.isArray(nodeInput) || nodeInput.length !== 9) {
    throw new RangeError('Exactly nine soundboard IR nodes required');
  }
  const nodes = nodeInput.map(checkedNode);
  const head = [];
  for (const ring of HEAD_RING_ORDER) {
    for (let slot = HEAD_SLOTS - 1; slot >= 0; slot--) {
      const offset = (HEAD_SLOTS - 1 - slot) * HEAD_WINDOW;
      head.push({
        key: `${ring}:${slot}`,
        ring,
        slot,
        values: valuesAt(nodes[ring], offset, HEAD_WINDOW),
      });
    }
  }

  const tail = [];
  const globalEnd = [];
  let ordinalBase = 0;
  for (const span of TAIL_ORDINAL_SPAN) {
    ordinalBase += span;
    globalEnd.push(ordinalBase);
  }
  for (let ring = 0; ring < 9; ring++) {
    const full = FULL_TAIL_WINDOWS[ring];
    const end = globalEnd[ring] - OMITTED_SHORT_ORDINALS[ring];
    for (let ordinal = end; ordinal > end - full; ordinal--) {
      const offset = HEAD_FLOATS + (end - ordinal) * TAIL_WINDOW;
      tail.push({
        key: `${ring}:${ordinal}`,
        ring,
        ordinal,
        values: valuesAt(nodes[ring], offset, TAIL_WINDOW),
      });
    }
  }
  for (let ring = 0; ring < 9; ring++) {
    if (!SHORT_TAIL_WINDOWS[ring]) continue;
    const full = FULL_TAIL_WINDOWS[ring];
    const ordinal = globalEnd[ring] - OMITTED_SHORT_ORDINALS[ring] - full;
    const offset = HEAD_FLOATS + full * TAIL_WINDOW;
    const values = Array(TAIL_WINDOW).fill(0);
    const available = Math.min(TAIL_WINDOW, nodes[ring].length - offset);
    for (let index = 0; index < available; index++) {
      values[index] = nodes[ring][offset + index];
    }
    tail.push({key: `${ring}:${ordinal}`, ring, ordinal, values});
  }
  return {head, tail};
}

export const soundboardIrLayout = Object.freeze({
  headFloats: HEAD_FLOATS,
  headWindow: HEAD_WINDOW,
  headSlots: HEAD_SLOTS,
  tailWindow: TAIL_WINDOW,
  headRingOrder: Object.freeze([...HEAD_RING_ORDER]),
  fullTailWindows: Object.freeze([...FULL_TAIL_WINDOWS]),
  shortTailWindows: Object.freeze([...SHORT_TAIL_WINDOWS]),
  tailOrdinalSpan: Object.freeze([...TAIL_ORDINAL_SPAN]),
});
