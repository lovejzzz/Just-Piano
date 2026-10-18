import assert from 'node:assert/strict';
import { ScalarAllpass } from '../dsp/scalar-allpass.mjs';

// No taps reduces to a delay; preserve continuous history across block cuts.
const delayed = new ScalarAllpass({ length: 8, write: 3, read: 0, taps: [] });
assert.deepEqual([...delayed.process(Float32Array.of(1, 2))], [0, 0]);
assert.deepEqual([...delayed.process(Float32Array.of(3, 4, 5))], [0, 1, 2]);
const config = { length: 8, write: 3, read: 0, taps: [{ start: 0, end: 3, c: 0.5, g: 0.75 }] };
assert.deepEqual([...new ScalarAllpass(config).process(Float32Array.of(1, 0, 0, 0))], [-0.5, 0, 0, 0.75]);
const whole = new ScalarAllpass(config), cut = new ScalarAllpass(config);
const impulse = Float32Array.from({ length: 32 }, (_, i) => i === 0 ? 1 : 0);
assert.deepEqual(whole.process(impulse), Float32Array.from([...cut.process(impulse.slice(0, 7)), ...cut.process(impulse.slice(7))]));
assert.deepEqual(whole.ring, cut.ring);
const alias = new ScalarAllpass({ length: 8, taps: [{ start: 0, end: 0, c: 0.5, g: 0.75 }] });
assert.deepEqual([...alias.process(Float32Array.of(1))], [0.5]);
const overflow = new ScalarAllpass({ length: 8, write: 0xffffffff, read: 0xffffffff, taps: [] });
assert.deepEqual([...overflow.process(Float32Array.of(1, 2))], [1, 2]);
assert.equal(overflow.write, 1);
assert.equal(overflow.read, 1);
assert.throws(() => new ScalarAllpass({ length: 7, taps: [] }));
console.log('scalar allpass: delay and uninterrupted history passed');
