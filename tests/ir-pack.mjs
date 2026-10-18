import assert from 'node:assert/strict';
import {applyIrPack, readIrPack} from '../dsp/ir-pack.mjs';

const head = [];
for (let ring = 0; ring < 9; ring++) {
  for (let slot = 0; slot < 16; slot++) {
    head.push({key: `${ring}:${slot}`, ring, values: Array(64).fill(ring + slot / 100)});
  }
}
const tail = [];
let ordinal = 0;
const tailCounts = [14, 14, 15, 13, 13, 13, 13, 13, 13];
for (let ring = 0; ring < 9; ring++) {
  const count = tailCounts[ring];
  for (let slot = 0; slot < count; slot++) {
    tail.push({key: `${ring}:${ordinal}`, ring, values: Array(512).fill(ring + slot / 100)});
    ordinal++;
  }
}
const pack = {schema: 1, head, tail};
const decoded = readIrPack(pack);
assert.equal(decoded.head.size, 144);
assert.equal(decoded.tail.size, 121);

const headConfig = {
  kernels: Array.from({length: 9}, (_, ring) => ({
    slots: Array.from({length: 16}, () => ({empty: 0})),
  })),
};
assert.equal(applyIrPack(headConfig, pack, 'head'), 144);
assert.equal(headConfig.kernels[0].slots[0].timeInput.length, 128);
assert.equal(headConfig.kernels[0].slots[0].timeInput[64], 0);

const tailConfig = {
  kernels: Array.from({length: 9}, (_, ring) => ({
    slots: Array.from({length: tailCounts[ring]}, () => ({empty: 0})),
  })),
};
assert.equal(applyIrPack(tailConfig, pack, 'tail'), 121);
assert.equal(tailConfig.kernels[0].slots[0].timeInput.length, 1024);

assert.throws(() => readIrPack({...pack, schema: 2}), /schema/);
assert.throws(() => readIrPack({...pack, head: [...head, head[0]]}), /Duplicate/);
assert.throws(() => readIrPack({
  ...pack,
  head: [{...head[0], values: [1]}, ...head.slice(1)],
}), /entries required|Invalid head/);
assert.throws(() => applyIrPack({kernels: []}, pack, 'head'), /Unused head/);

console.log('PASS private IR pack validation and head/tail application');
