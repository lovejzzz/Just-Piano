// 35f2c4..35f320: initialized voice expression from controller/profile inputs.
import {fma32} from './modal-kernel.mjs';
import {scalarMidiCcToEventValue} from './midi-event-normalization.mjs';
import {pedalSemanticsForMidiCc} from './midi-control-semantics.mjs';
const f = Math.fround;
export function voiceExpressionControls({ec, f0, f4, mix, gain, specialValue, flags}) {
  if (![ec, f0, f4, mix, gain, specialValue].every(v => Number.isFinite(v) && Number.isFinite(f(v))) ||
      !Array.isArray(flags) || flags.length !== 3 || flags.some(v => !Number.isInteger(v) || v < 0 || v > 255))
    throw new Error('Finite expression inputs and three configuration bytes required');
  const complement = f(f(1 - f(ec)) - f(ec));
  const u = f(fma32(f(mix), complement, f(ec)) * f(gain));
  const special = flags[0] === 1 && flags[1] === 1 && (flags[2] & 1) !== 0;
  return {u, control30: f(f0), lowerControl: f(special ? specialValue : f4)};
}
export function celesteVoiceExpressionFromMidi(value, profile, {internalParameterId} = {}) {
  if (pedalSemanticsForMidiCc(69, internalParameterId).eventType !== 10)
    throw new Error('Verified Celeste Pedal mapping required; CC69 alone is ambiguous');
  // Deliberately select profile fields: no captured ec or final voice value read.
  return voiceExpressionControls({ec: scalarMidiCcToEventValue(value),
    f0: profile.f0, f4: profile.f4, mix: profile.mix, gain: profile.gain,
    specialValue: profile.specialValue, flags: profile.flags});
}
