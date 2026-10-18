import assert from 'node:assert/strict';
import { KeyResonance64, createColdKeyResonance64 } from '../dsp/key-resonance.mjs';

const cold = (modes = 1) => ({ modeCount: modes, stateFloats: Math.ceil(modes / 2) * 4,
  sleeping: 1, previousInput: 0, stateAllPositiveZero: true });
const co = { b: 1, a: 0, c: -0.5, d: 0.25 };
const model = new KeyResonance64(cold());
const impulse = new Float32Array(64); impulse[63] = 1;
const output = model.process64(impulse, [co], 1, new Float32Array(64));
assert.equal(output[63], -1);
assert.equal(model.states[0], 1);
assert.equal(model.previousInput, 1);
assert.equal(model.wakes, 1);
const tail = model.process64(null, [co], 1, new Float32Array(64));
assert.deepEqual([...tail.slice(0, 6)], [-0.5, 0, 0.125, 0.0625, 0, -0.015625]);
assert.equal(model.previousInput, 0);
const baseline = new Float32Array(64).fill(3);
assert.deepEqual(model.process64(null, [co], 1, baseline), baseline);
assert.equal(model.sleeping, 1);
assert.equal(model.sleeps, 1);
const disabled = new KeyResonance64(cold());
assert.deepEqual(disabled.process64(impulse, [co], 0, baseline), baseline);
assert.equal(disabled.wakes, 0);
assert.equal(disabled.previousInput, 0);
const grouped = new KeyResonance64(cold(5));
const coefficients = [2 ** 24, 1, -(2 ** 24), 0, 1].map(b => ({ b, a: 0, c: 0, d: 0 }));
assert.equal(grouped.process64(new Float32Array(64).fill(1), coefficients, 1, new Float32Array(64))[0], -2);
assert.equal(grouped.states[10], 0); assert.equal(grouped.states[11], 0);
assert.throws(() => new KeyResonance64({ ...cold(), stateAllPositiveZero: false }));
assert.throws(() => model.process64([NaN], [co], 1, baseline));
// Only model size is available to the independent cold initializer.
const denied = new Proxy({ modeCount: 5 }, { get(object, key) {
  if (key !== 'modeCount') throw Error('Observed initial state read: ' + String(key));
  return object[key];
} });
const ownCold = createColdKeyResonance64(denied);
assert.equal(ownCold.states.length, 12);
assert.equal(ownCold.sleeping, 1);
assert.equal(ownCold.previousInput, 0);
assert.ok(ownCold.states.every(x => Object.is(x, 0)));
for (const input of [null, impulse]) {
  const awake = new KeyResonance64({ ...cold(), sleeping: 0 });
  const asleep = createColdKeyResonance64({ modeCount: 1 });
  assert.deepEqual(awake.process64(input, [co], 1, baseline), asleep.process64(input, [co], 1, baseline));
  assert.deepEqual(awake.states, asleep.states);
  assert.equal(awake.sleeping, asleep.sleeping);
  assert.equal(awake.previousInput, asleep.previousInput);
}
console.log('key recurrence: subtraction, four-lane grouping, null-input tail, sleep, wake, padding and bypass passed');
