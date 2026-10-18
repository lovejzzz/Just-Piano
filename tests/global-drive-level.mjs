import assert from 'node:assert/strict';
import { GlobalDriveLevel } from '../dsp/global-drive-level.mjs';
import { GlobalRawKeys } from '../dsp/global-raw-keys.mjs';

const level = new GlobalDriveLevel({ weights: [2], sampleRate: 48000, enabledGain: 1 });
assert.equal(level.process([1], 0), 0);
assert.equal(level.previous[0], 0);
for (let i = 0; i < 18; i++) assert.equal(level.process([0.5], 0), 0);
assert.equal(level.process([0.5], 0), -1);
assert.equal(level.previous[0], 0.5);
assert.equal(level.timers[0], 0);
assert.equal(level.crossings, 1);
assert.equal(level.expiries, 1);
assert.equal(level.process([0], 0), 0);
for (let i = 0; i < 18; i++) assert.equal(level.process([0], 0), 0);
assert.equal(level.process([0], 0), -1);
const initialize = new GlobalDriveLevel({ weights: [1], sampleRate: 48000, enabledGain: 1, initialReset: 1 });
assert.equal(initialize.process([1], 0), 0);
assert.equal(initialize.previous[0], 1);
assert.equal(initialize.crossings, 0);

const snapshot = { samples: 64, sampleRate: 48000, hostControl: 0, hostBlend: 0,
  softControl: 0, pedalControl: 0, binaryPedal: 0, bypassFlags: [0, 0],
  keys: [{ flags: [1, 0, 0], localControl: 0, localSoftControl: 0,
    nodes: [{ object: 'node', position: 0.1, intermediate: 0.1, velocity: 1 }] }] };
const raw = new GlobalRawKeys(snapshot);
assert.equal(raw.process(snapshot, { timeStep: 0 }).values[0], Math.fround(0.1));
assert(raw.process(snapshot).values[0] > Math.fround(0.1));
assert.throws(() => raw.process(snapshot, { timeStep: -1 }));
console.log('drive level: crossing delay, frozen reference, release and zero-time key initialization passed');
