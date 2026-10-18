import assert from 'node:assert/strict';
import {createMidiRattleTimeline} from '../dsp/midi-rattle-timeline.mjs';
const cc = (frame, value) => ({frame, kind: 'controlChange', controller: 64, channel: 0, value});
const on = frame => ({frame, kind: 'noteOn', channel: 0, note: 69, velocity: 96});
const presetFields = [{object_offset: 0x1518, value: [2, 3, 4, 6]}];
const noteOnFrames = [4800, 10496, 12992, 14976, 20992];
const events = [cc(0, 32), on(4800), cc(8000, 64), on(10496), cc(11968, 96),
  on(12992), on(14976), cc(16000, 127), cc(19968, 0), on(20992)];
const timeline = createMidiRattleTimeline({events, presetFields, noteOnFrames});
assert.deepEqual(noteOnFrames.map((_, epoch) => timeline.initialValue(epoch)),
  [.25, .5, Math.fround(.755), Math.fround(.755), 0]);
assert.equal(timeline.valueAtConsumerAge(0, 3136), .25);
assert.equal(timeline.valueAtConsumerAge(0, 3200), .5);
assert.equal(timeline.valueAtConsumerAge(0, 7104), .5);
assert.equal(timeline.valueAtConsumerAge(0, 7168), Math.fround(.755));
assert.equal(timeline.valueAtConsumerAge(1, 1472), Math.fround(.755));
assert.equal(timeline.valueAtConsumerAge(3, 1024), 1);
assert.equal(timeline.valueAtConsumerAge(3, 4992), 0);
assert.equal(timeline.valueAtConsumerAge(4, 99968), 0);
// The producer retains values, not mutable caller event/archive objects.
events[0].value = 127;
presetFields[0].value[3] = 1;
assert.equal(timeline.initialValue(0), .25);
assert.throws(() => timeline.initialValue(5), RangeError);
assert.throws(() => timeline.valueAtConsumerAge(0, 1), RangeError);
assert.throws(() => createMidiRattleTimeline({events, presetFields, noteOnFrames}));
const valid = [{object_offset: 0x1518, value: [2, 3, 4, 6]}];
assert.throws(() => createMidiRattleTimeline({events: [on(4800)], presetFields: valid, noteOnFrames: [4800]}));
assert.throws(() => createMidiRattleTimeline({events: [cc(0, 32), {...on(4800), channel: 1}],
  presetFields: valid, noteOnFrames: [4800]}));
console.log('Rattle MIDI source values, absolute control boundaries, voice starts and supported-input guards passed');
