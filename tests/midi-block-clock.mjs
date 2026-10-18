import assert from 'node:assert/strict';
import {midiBlockClock} from '../dsp/midi-block-clock.mjs';
const vlq = value => { const a = [value & 127]; while (value >>= 7) a.unshift((value & 127) | 128); return a; };
function file(events) {
  const track = Buffer.from(events.flatMap(([delta, data]) => [...vlq(delta), ...data]));
  const header = Buffer.from('4d546864000000060000000101e04d54726b00000000', 'hex');
  header.writeUInt32BE(track.length, 18); return Buffer.concat([header, track]);
}
const births = [96, 210, 260, 300, 420], events = [[0, [255, 81, 3, 7, 161, 32]]];
let last = 0;
for (const ticks of births) { events.push([ticks - last, [144, 69, 96]]); last = ticks; }
events.push([60, [255, 47, 0]]);
const clock = midiBlockClock(file(events), {sampleRate: 48000});
assert.deepEqual(clock.noteOns.map(e => e.frame), [4800, 10496, 12992, 14976, 20992]);
assert.deepEqual(clock.noteOns.slice(1).map((e, i) => e.frame - clock.noteOns[i].frame), [5696, 2496, 1984, 6016]);
const changedTempo = file([[0, [144, 60, 96]], [480, [255, 81, 3, 15, 66, 64]],
  [240, [144, 62, 96]], [0, [64, 96]], [0, [176, 64, 127]], [0, [255, 47, 0]]]);
const changed = midiBlockClock(changedTempo, {sampleRate: 48000});
assert.deepEqual(changed.noteOns.map(e => [e.note, e.frame]), [[60, 0], [62, 48000], [64, 48000]]);
assert.equal(changed.events.at(-1).controller, 64);
assert.equal(changed.events.at(-1).frame, 48000);
assert.throws(() => midiBlockClock(changedTempo.subarray(0, changedTempo.length - 1), {sampleRate: 48000}), RangeError);
assert.throws(() => midiBlockClock(changedTempo, {sampleRate: 48000, blockSize: 128}), RangeError);
assert.throws(() => midiBlockClock(file([[0, [255, 81, 3, 0, 0, 0]], [0, [255, 47, 0]]]), {sampleRate: 48000}), RangeError);


assert.equal(clock.systemExclusiveCount,0);
assert.equal(midiBlockClock(file([[0,[240,2,1,247]],[0,[255,47,0]]]),{sampleRate:48000}).systemExclusiveCount,1);
console.log('MIDI absolute block clocks, cross-boundary age, tempo integration, running status and guards passed');
