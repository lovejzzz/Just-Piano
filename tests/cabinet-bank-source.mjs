import assert from 'node:assert/strict';
import {soundboardIrSlots} from '../dsp/soundboard-ir-nodes.mjs';
import {buildCabinetBanksFromIrPack} from '../dsp/cabinet-bank-source.mjs';
import {CabinetConvolution64} from '../dsp/cabinet-convolution.mjs';

const nodes = Array.from({length: 9}, (_, i) => new Float32Array(i < 3 ? 8384 : 7552));
nodes[0][0] = 1;
nodes[0][1024] = 0.25;
const pack = {schema: 1, ...soundboardIrSlots(nodes), source: {nodeLengths: nodes.map(n => n.length)}};
const source = buildCabinetBanksFromIrPack(pack);
assert.deepEqual(source.head.kernels.map(r => r.slots.length), Array(9).fill(16));
assert.deepEqual(source.tail.kernels.map(r => r.slots.length), [15, 15, 15, 13, 13, 13, 13, 13, 13]);
assert.equal(source.head.plans[0].length, 156);
assert.equal(source.tail.plans[0].length, 135);
assert.equal(source.head.inputs.every(r => r.cursor === 0 && r.slots.every(s => s.empty === 1)), true);
const model = new CabinetConvolution64(source.head, source.tail);
const response = [];
for (let block = 0; block < 17; block++) {
  const input = Array.from({length: 9}, () => new Float32Array(64));
  if (!block) input[0][0] = 1;
  response.push(...model.process64(input, Array.from({length: 3}, () => new Float32Array(64))).output[0]);
}
assert.equal(response[0], 1);
assert.equal(response[1024], 0.25);
assert.equal(response.every((v, i) => i === 0 || i === 1024 || v === 0), true);
assert.throws(() => buildCabinetBanksFromIrPack({...pack, source: {nodeLengths: [8384]}}), /node lengths/);
assert.throws(() => buildCabinetBanksFromIrPack({...pack, tail: pack.tail.slice(1)}), /121/);
assert.equal(pack.head[0].values.every(Number.isFinite), true);
console.log('PASS archive IR cold-bank source, compiled scheduling and 1024-frame tail impulse');
