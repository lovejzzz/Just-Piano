import assert from 'node:assert/strict';
import {createMidiKeyReleaseTimeline, releaseLinkSuppressed} from '../dsp/midi-key-release-timeline.mjs';
const curve = y => ({x: [0, 1], y});
const identity = curve([0, 1]);
const baseFields = [{object_offset: 0x6d8, value: identity}, {object_offset: 0x728, value: identity},
  {object_offset: 0x2f10, kind: 'mar_param', value: {fields: [
    {object_offset: 0xd18, kind: 'c', value: curve([.01, .01])},
    {object_offset: 0xd68, kind: 'c', value: curve([60, 60])},
    {object_offset: 0xdb8, kind: 'c', value: curve([1, 1])},
  ]}}];
const presetFields = [0xd88, 0xe28, 0xe78].map(object_offset => ({object_offset, value: identity}));
presetFields.push({object_offset: 0xdd8, value: curve([1, 1])}, {object_offset: 0xf20, value: 0},
  {object_offset: 0x1518, value: [2, 3, 4, 6]});
const events = [{kind: 'noteOn', note: 69, channel: 0, velocity: 96, frame: 0},
  {kind: 'noteOff', note: 69, channel: 0, velocity: 0, frame: 640},
  {kind: 'noteOn', note: 69, channel: 0, velocity: 96, frame: 1280}];
const eventClock = {sampleRate: 48000, blockSize: 64, events};
const own = createMidiKeyReleaseTimeline({baseFields, presetFields, eventClock});
assert.deepEqual(own.stateAtFrame(576), {u: 1, releaseFlag: 0, frame: 576});
assert.deepEqual(own.stateAtFrame(640), {u: 0.8685315251350403, releaseFlag: 1, frame: 640});
assert.deepEqual(own.stateAtFrame(1088), {u: 0, releaseFlag: 1, frame: 1088});
assert.deepEqual(own.stateAtFrame(1280), {u: 1, releaseFlag: 0, frame: 1280});
assert.equal(own.stateAtFrame(640).u, 0.8685315251350403); // Cached historical query does not rewind state.
assert.equal(own.velocityAtFrame(576),Math.fround(1e10));
assert.ok(own.velocityAtFrame(640)<0);
assert.equal(own.velocityAtFrame(1280),Math.fround(1e10));
assert.throws(() => own.stateAtFrame(641), RangeError);
assert.equal(releaseLinkSuppressed({velocity: .5, release: .5}, {velocity: .5, release: .5}, 1), true);
assert.equal(releaseLinkSuppressed({velocity: .5, release: .5}, {velocity: .5, release: .75}, 1), false);
assert.equal(releaseLinkSuppressed({velocity: .5, release: .5}, {velocity: .5, release: .5}, 0), false);
assert.equal(releaseLinkSuppressed(null, {velocity: .5, release: .5}, 1), false);
assert.throws(() => createMidiKeyReleaseTimeline({baseFields, presetFields,
  eventClock: {...eventClock, events: [{...events[0], frame: 1}]}}));
events[2].frame = 0;
assert.equal(own.stateAtFrame(1344).u, 1); // Input objects were frozen into the independent timeline.
assert.throws(() => createMidiKeyReleaseTimeline({baseFields, presetFields, eventClock}));
console.log('MIDI held/released/retriggered key state, exact ramp, strict strength gate and input guards passed');
