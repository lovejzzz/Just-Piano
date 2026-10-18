// Ordinary A4 key integration. Scheduling and per-voice publication are external.
import {archiveKeyReleaseControls} from './archive-key-release-controls.mjs';
import {managerEventCurvesFromArchive, buildManagerEventTables} from './manager-event-tables.mjs';
import {mapManagerEventValue, randomizeManagerEventValue} from './manager-event-velocity.mjs';
import {KeyNoteOffVelocity} from './key-noteoff-velocity.mjs';
import {advanceReleasedKey} from './release-key-state.mjs';
const f = Math.fround;

// 5e2114..5e2138: a weak following voice is marked without publishing new controls.
export function releaseLinkSuppressed(previous, current, releaseFlag) {
  if (![0, 1].includes(releaseFlag) || !current ||
      ![current.velocity, current.release, ...(previous ? [previous.velocity, previous.release] : [])].every(Number.isFinite))
    throw new Error('Finite same-run voice release strengths required');
  return Boolean(previous && releaseFlag &&
    f(f(previous.velocity * previous.release) * f(1.5)) > f(current.velocity * current.release));
}

export function createMidiKeyReleaseTimeline({baseFields, presetFields, eventClock}) {
  const controls = archiveKeyReleaseControls({baseFields, note: 69, runtimeCurveMode: 'linear-clamp'});
  if (controls.amplitudeScale !== 1 || eventClock?.blockSize !== 64 || !Number.isInteger(eventClock.sampleRate) ||
      eventClock.sampleRate <= 0 || !Array.isArray(eventClock.events))
    throw new Error('Supported amplitude-independent ordinary key release and explicit clock required');
  const assignment = presetFields.find(row => row.object_offset === 0x1518)?.value;
  if (!Array.isArray(assignment) || assignment.length !== 4 ||
      assignment.some((value, i) => value !== [2, 3, 4, 6][i]))
    throw new Error('Verified Rattle pedal assignment required for zero Sustain drive');
  const events = eventClock.events.filter(event => event.kind === 'noteOn' || event.kind === 'noteOff')
    .map(event => ({...event}));
  if (eventClock.events.some(event => event.kind === 'controlChange' && event.controller !== 64) ||
      events.some(event => event.channel !== 0 || event.note !== 69 ||
        (event.kind === 'noteOff' && event.velocity !== 0)))
    throw new Error('Supported A4 fixture without other pedal controls required');
  if (events.some((event, i) => !Number.isSafeInteger(event.frame) || event.frame < 0 || event.frame % 64 ||
      (i && event.frame < events[i - 1].frame))) throw new Error('Chronological MIDI key block times required');
  const table = buildManagerEventTables({...managerEventCurvesFromArchive({baseFields, presetFields}),
    useGlobal: false, runtimeMode: 'linear-clamp'}).noteOff;
  const release = mapManagerEventValue(randomizeManagerEventValue(0, 0, {kind: 1, eligible: false}), {kind: 1, table});
  const producer = new KeyNoteOffVelocity({keys: [{nodes: [
    {object: 'midi-key69', velocity: f(1e10), id: 0, tag: 0, mask: 1},
  ]}]});
  const negativeVelocity = producer.apply({key: 0, id: 0, tag: 0, clearMask: 1, negativeOnly: 0,
    release, controls, nodes: [{object: 'midi-key69', voice: '0x0'}]})[0].velocity;
  const states = [], velocities = [], dt = f(f(64) / f(eventClock.sampleRate));
  let position = 0, velocity = 0, index = 0;
  const timeline = {
    stateAtFrame(frame) {
      if (!Number.isSafeInteger(frame) || frame < 0 || frame % 64 || frame > 384000 * 600)
        throw new RangeError('Bounded absolute key block time required');
      while (states.length <= frame / 64) {
        const time = states.length * 64;
        while (index < events.length && events[index].frame === time) {
          const event = events[index++];
          if (event.kind === 'noteOn') { position = 1; velocity = f(1e10); }
          else velocity = negativeVelocity;
        }
        if (velocity < 0) position = advanceReleasedKey({position, velocity, dt, keyCap: 1, softCap: 1}).position;
        velocities.push(velocity);
        states.push({u: position, releaseFlag: Number(position < 0.999 && velocity < 0)});
      }
      return {...states[frame / 64], frame};
    },
    velocityAtFrame(frame) {
      timeline.stateAtFrame(frame);
      return velocities[frame / 64];
    },
  };
  return Object.freeze(timeline);
}
