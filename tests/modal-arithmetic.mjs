import assert from 'node:assert/strict';
import { fma32, renderSixteen } from '../dsp/modal-kernel.mjs';
import { linearModelCurve, archiveHardnessAt69 } from '../dsp/model-curves.mjs';

// Cases independently checked against macOS libSystem.fmaf. These two halfway
// cases distinguish a float32 FMA from a multiply/add rounded through double.
const a = 8 + 2 ** -20;
const b = 8 - 2 ** -20;
const c = 2 ** 30 + 128;
assert.equal(fma32(a, b, c), c);
assert.equal(fma32(-a, b, c), c);
assert.notEqual(Math.fround(a * b + c), c);
assert.notEqual(Math.fround(-a * b + c), c);
assert.equal(fma32(2 ** -149, 0.5, 0), 0);
assert.equal(fma32(2 ** -149, 0.5, 2 ** -149), 2 ** -148);
assert.equal(fma32(2, 3, -6), 0);
assert.equal(fma32(Infinity, 2, 1), Infinity);
assert(Number.isNaN(fma32(Infinity, 0, 1)));
assert(Number.isNaN(fma32(Infinity, 1, -Infinity)));
assert(Object.is(fma32(-0, 1, -0), -0));

// A zero kernel must preserve earlier groups' accumulated output. Invalid
// dimensions must fail instead of quietly introducing missing/NaN lanes.
const zero = () => new Float32Array(16);
const output = Float32Array.from([1, -2, 3, -4]);
renderSixteen(zero(), zero(), zero(), zero(), output);
assert.deepEqual([...output], [1, -2, 3, -4]);
assert.throws(() => renderSixteen(new Float32Array(15), zero(), zero(), zero(), output));
assert.throws(() => renderSixteen(zero(), zero(), zero(), zero(), new Float32Array(3)));
console.log('PASS: fused float32 rounding boundaries and modal kernel contract');

// Synthetic equal endpoints expose the wrong fused operand: reversing it
// loses one ULP even though both stored values are identical.
const curve = { x: [0, 1], y: [0.1, 0.1] };
const mode = { runtimeMode: 'linear-clamp' };
assert.equal(linearModelCurve(curve, 0.1, mode)[0], Math.fround(0.1));
assert.deepEqual(linearModelCurve({ x: [], y: [0.25, 0.5] }, 69, mode), [0.25, 0.5]);
assert.deepEqual(linearModelCurve({ x: [0, 1], y: [1, 2, 3, 4] }, 0.5, mode), [2, 3]);
assert.throws(() => linearModelCurve(curve, 0.1));
assert.throws(() => linearModelCurve({ x: [1, 0], y: [1, 2] }, 0.5, mode));
assert.throws(() => archiveHardnessAt69({ note: 68 }));
console.log('PASS: model curve fused order, row layout and unverified branch guards');
