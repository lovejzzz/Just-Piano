import assert from 'node:assert/strict';
import {constructSoundboardGrid} from '../dsp/soundboard-grid.mjs';
import {constructSoundboardExcitation} from '../dsp/soundboard-excitation.mjs';
import {initializeSoundboardFromConfig} from '../dsp/soundboard-initialization.mjs';
const parameters = {sampleRate: 100, method: 1, width: 1, height: 1, propagation: 100,
  stability0: 0.1, stability1: 0, boundary0: 0, boundary1: 0, sourcePosition: 0.5,
  bridge: Float32Array.of(0, 1, 1, 0)};
const grid = constructSoundboardGrid(parameters);
assert.equal(grid.nx, 3); assert.equal(grid.ny, 3); assert.equal(grid.size, 16);
assert.deepEqual(grid.active, Uint32Array.of(5, 9, 6));
assert.equal(grid.active.length + grid.inactive.length, grid.size);
assert.equal(new Set([...grid.active, ...grid.inactive]).size, grid.size);
assert.deepEqual(grid.bridgeIndices, Uint32Array.of(12, 9, 6, 3));
assert.equal(grid.excitationIndex, 9);
assert.equal(constructSoundboardGrid({...parameters, boundary0: 1, boundary1: 1}).active.length, 4);
assert.equal(constructSoundboardGrid({...parameters, method: 0.5}).nx, 4);
const exc = constructSoundboardExcitation(grid, {amplitude: 1, width: 0});
assert.equal(exc.output.length, 4); assert.ok(exc.output[0] > 0);
assert.equal(exc.output[3], -exc.output[0]); assert.equal(exc.output[2], -exc.output[1]);
assert.equal(constructSoundboardExcitation(grid, {amplitude: 1, width: 0.08}).output.length, 10);
assert.throws(() => constructSoundboardGrid({...parameters, method: 0.25}), /geometry/);
assert.throws(() => constructSoundboardGrid({...parameters, bridge: Float32Array.of(1, 0, 1, 0)}), /geometry/);
assert.throws(() => constructSoundboardExcitation(grid, {amplitude: 0, width: 0}), /controls/);
assert.throws(() => initializeSoundboardFromConfig(new Uint8Array(4), parameters.bridge), /configuration/);
console.log('PASS grid partition/order, bridge source selection, stability modes and differentiated Gaussian excitation');
