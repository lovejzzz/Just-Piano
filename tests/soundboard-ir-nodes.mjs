import assert from 'node:assert/strict';
import {soundboardIrLayout, soundboardIrSlots} from '../dsp/soundboard-ir-nodes.mjs';

const nodes = Array.from({length: 9}, (_, ring) => {
  const node = new Float32Array(ring < 3 ? 8384 : 7552);
  for (let index = 0; index < node.length; index++) node[index] = ring * 100000 + index;
  return node;
});
const slots = soundboardIrSlots(nodes);

assert.equal(slots.head.length, 144);
assert.equal(slots.tail.length, 121);
assert.equal(slots.head[0].key, '8:15');
assert.deepEqual(slots.head[0].values, Array.from(nodes[8].subarray(0, 64)));
assert.equal(slots.head[16].key, '0:15');
assert.deepEqual(slots.head[16].values, Array.from(nodes[0].subarray(0, 64)));

assert.equal(slots.tail[0].key, '0:14');
assert.deepEqual(slots.tail[0].values, Array.from(nodes[0].subarray(1024, 1536)));
assert.equal(slots.tail[14].key, '1:29');
assert.deepEqual(slots.tail[114].key, '2:30');
assert.equal(slots.tail[120].key, '8:110');
assert.equal(slots.tail[114].values[0], nodes[2][1024 + 14 * 512]);
assert.equal(slots.tail[114].values[192], 0);
assert.equal(slots.tail[120].values[384], 0);

assert.deepEqual(soundboardIrLayout.fullTailWindows, [14, 14, 14, 12, 12, 12, 12, 12, 12]);
assert.deepEqual(soundboardIrLayout.tailOrdinalSpan, [15, 14, 15, 13, 13, 13, 13, 13, 13]);
assert.throws(() => soundboardIrSlots(nodes.slice(0, 8)), /Exactly nine/);
assert.throws(() => soundboardIrSlots([
  new Float32Array(1024), ...nodes.slice(1),
]), /too short/);
const nonFinite = nodes.map((node) => new Float32Array(node));
nonFinite[4][500] = Infinity;
assert.throws(() => soundboardIrSlots(nonFinite), /non-finite/);

console.log('PASS soundboard IR node layout, short-window padding and guards');
