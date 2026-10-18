import assert from 'node:assert/strict';
import { accumulateKeyMono64 } from '../dsp/key-mono-accumulation.mjs';

const item = (value, keyIndex = 69) => ({ keyIndex, mixLevels: [1, 1, 0, 0], monoContribution: Array(64).fill(value) });
const a = item(2 ** 24), b = item(1), c = item(-(2 ** 24));
assert.equal(accumulateKeyMono64([a, b, c]).firstModal[0], 0);
assert.equal(accumulateKeyMono64([a, c, b]).firstModal[0], 1);
assert.equal(accumulateKeyMono64([a, b, c]).secondModal[0], 0);
assert.equal(accumulateKeyMono64([a, c, b]).secondModal[0], 1);
// Different-key slot summation follows key order, independent of arrival order.
const distinct = [item(2 ** 24, 0), item(1, 1), item(-(2 ** 24), 2)];
assert.equal(accumulateKeyMono64(distinct).firstModal[0], 0);
assert.equal(accumulateKeyMono64([distinct[0], distinct[2], distinct[1]]).firstModal[0], 0);
const disabled = item(123); disabled.mixLevels = [0, 0, 0, 0];
assert.equal(accumulateKeyMono64([disabled]).slots.size, 0);
assert.throws(() => accumulateKeyMono64([{ ...a, keyIndex: -1 }]));
assert.throws(() => accumulateKeyMono64([{ ...a, monoContribution: [NaN] }]));
console.log('key mono: same-key order sensitivity, key-index summation and disabled branches passed');
