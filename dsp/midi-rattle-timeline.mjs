// Source values from the decoded fourth-pedal Rattle assignment and MIDI.
// Sampling this timeline does not implement native dispatch or worker scheduling.
import {scalarMidiCcToEventValue} from './midi-event-normalization.mjs';

export function createMidiRattleTimeline({events, presetFields, noteOnFrames}) {
  const assignment = presetFields.find(row => row.object_offset === 0x1518)?.value;
  if (!Array.isArray(assignment) || assignment.length !== 4 ||
      assignment.some((value, i) => value !== [2, 3, 4, 6][i]) ||
      !Array.isArray(events) || !Array.isArray(noteOnFrames) || !noteOnFrames.length)
    throw new Error('Explicit supported archive Rattle assignment and MIDI clock required');
  const controls = [], starts = [];
  let current, previousFrame = -1;
  for (const event of events) {
    if (!Number.isSafeInteger(event.frame) || event.frame < 0 || event.frame % 64 || event.frame < previousFrame)
      throw new Error('Chronological absolute MIDI block times required');
    previousFrame = event.frame;
    if (event.kind === 'controlChange' && event.controller === 64) {
      if (event.channel !== 0) throw new Error('Supported channel-zero Rattle MIDI required');
      current = scalarMidiCcToEventValue(event.value);
      controls.push({frame: event.frame, value: current});
    } else if (event.kind === 'noteOn') {
      if (event.channel !== 0 || event.note !== 69 || current === undefined || event.frame !== noteOnFrames[starts.length])
        throw new Error('Supported A4 starts after explicit Rattle controller required');
      starts.push({frame: event.frame, initial: current});
    }
  }
  if (starts.length !== noteOnFrames.length || controls[0]?.frame !== 0)
    throw new Error('Complete starts and explicit initial controller required');
  const start = epoch => {
    if (!Number.isInteger(epoch) || !starts[epoch]) throw new RangeError('Source MIDI voice epoch required');
    return starts[epoch];
  };
  return Object.freeze({
    initialValue(epoch) { return start(epoch).initial; },
    valueAtConsumerAge(epoch, age) {
      if (!Number.isSafeInteger(age) || age < 0 || age % 64)
        throw new RangeError('Nonnegative consumer block age required');
      const absolute = start(epoch).frame + age;
      if (!Number.isSafeInteger(absolute)) throw new RangeError('Exact MIDI clock range required');
      let value;
      for (const control of controls) {
        if (control.frame > absolute) break;
        value = control.value;
      }
      if (value === undefined) throw new Error('Explicit preceding MIDI controller required');
      return value;
    },
  });
}
