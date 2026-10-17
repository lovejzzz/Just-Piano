import assert from 'node:assert/strict';
import {buildManagerEventTables} from '../dsp/manager-event-tables.mjs';
const curve = (y) => ({x: [0, 1], y});
const input = {
  base: {noteOn: curve([0, 0.5]), pedal: curve([0, 1])},
  preset: {noteOn: curve([0, 0.5]), noteOff: curve([0, 0.5]),
    pedal: curve([0, 1]), pitch: curve([-1, 1]), pedalInvert: 1},
  useGlobal: false, runtimeMode: 'linear-clamp',
};
const a = buildManagerEventTables(input);
assert.deepEqual(Object.values(a).map(t => t.length), [129,129,129,129]);
assert.equal(a.noteOn[127], 0.25); // two composed curves, not one identity table
assert.equal(a.noteOn[128], Math.fround(0.5 - a.noteOn[126]));
assert.equal(a.noteOff[127], 0.5);
assert.equal(a.pedal[0], 1);
assert.equal(a.pedal[127], 0);
assert.equal(a.pedal[128], a.pedal[127]);
assert.equal(a.pitch[0], -1);
assert.equal(a.pitch[128], 1);
const overrides = buildManagerEventTables({...input, useGlobal: true, global: {
  noteOn: curve([0,1]), noteOff: {x: [], y: []}, pedal: curve([1,0]),
}});
assert.equal(overrides.noteOn[127], 0.5);
assert.deepEqual(overrides.noteOff, a.noteOff); // empty Y means use preset
assert.equal(overrides.pedal[0], 0);
assert.deepEqual(overrides.pitch, a.pitch); // pitch has no global override
const constants = buildManagerEventTables({...input, useGlobal:true, global: {
  noteOn:{x:[], y:[0.8]}, noteOff:{x:[], y:[0.7]}, pedal:{x:[], y:[0.6]},
}});
assert.equal(constants.noteOn[0], Math.fround(0.8)); // empty X alone does not disable override
assert.equal(constants.noteOff[127], Math.fround(0.7));
assert.throws(() => buildManagerEventTables({...input, useGlobal: undefined}));
assert.throws(() => buildManagerEventTables({...input, useGlobal: true}));
assert.throws(() => buildManagerEventTables({...input, runtimeMode: undefined}));
assert.throws(() => buildManagerEventTables({...input, base: {...input.base, noteOn: {x:[0,1],y:[0,1,2,3]}}}));
console.log('Manager event table composition, boundaries, overrides and input guards passed (synthetic fixtures).');
