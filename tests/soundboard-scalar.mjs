import assert from 'node:assert/strict';
import {soundboardScalarControls} from '../dsp/soundboard-scalar.mjs';

const captured = soundboardScalarControls({
  h: 0.04827586188912392,
  tau: 2.2675736545352265e-05,
  T: 0.25,
  p: 4949.2548828125,
  q: 30,
  r: 27000,
});
assert.equal(captured.steps, 11026);
assert.ok(Number.isFinite(captured.alpha));
assert.ok(Number.isFinite(captured.beta));
assert.ok(Number.isFinite(captured.rho));
assert.ok(Number.isFinite(captured.eta));
assert.ok(Number.isFinite(captured.epsilon));
assert.ok(captured.alpha < 0);
assert.ok(captured.beta > 0);
assert.ok(captured.eta > 0);

assert.throws(() => soundboardScalarControls({h: 0, tau: 1, T: 1, p: 1, q: 1, r: 1}), /Positive/);
assert.throws(() => soundboardScalarControls({h: 1, tau: 0, T: 1, p: 1, q: 1, r: 1}), /Positive/);
assert.throws(() => soundboardScalarControls({h: 1, tau: 1, T: -1, p: 1, q: 1, r: 1}), /nonnegative/);
assert.throws(() => soundboardScalarControls({h: 1, tau: 1, T: 1, p: NaN, q: 1, r: 1}), /Finite p/);

console.log('PASS soundboard scalar propagation prefix and guards');
