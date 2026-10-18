import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {readFormatZeroNoteOns} from './pianoteq_note_on_velocity_source.mjs';
import {celesteVoiceExpressionFromMidi, voiceExpressionControls} from '../dsp/voice-expression-controls.mjs';
import {scalarMidiCcToEventValue} from '../dsp/midi-event-normalization.mjs';

const [directory, output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw new Error('Usage: native-directory fresh-report');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const captureBytes = fs.readFileSync(path.join(directory, 'runtime.json'));
const launchBytes = fs.readFileSync(path.join(directory, 'launch.json'));
const log = fs.readFileSync(path.join(directory, 'lldb.log'));
const d = JSON.parse(captureBytes), launch = JSON.parse(launchBytes);
if (d.targetMutation !== false || d.hardwareBreakpoints !== 1 || d.runStatus?.terminal !== true ||
    d.runStatus.exitStatus !== 0 || !Array.isArray(d.errors) || d.errors.length ||
    !Array.isArray(d.expressionErrors) || d.expressionErrors.length ||
    /could not read|corrupt (?:FXP file|archive)|marap_oo\.hh|Traceback/i.test(log.toString()))
  throw new Error('Complete error-free read-only native observation required');
function argument(name) {
  if (launch.arguments?.filter(x => x === name).length !== 1) throw new Error('Unique argument required: ' + name);
  return launch.arguments[launch.arguments.indexOf(name) + 1];
}
if (argument('--rate') !== '48000' || argument('--multicore') !== '0' ||
    !launch.arguments.includes('--no-prefs')) throw new Error('Explicit rate and isolated native settings required');
const celeste = launch.factoryPreset === 'U4 Small';
if (celeste) {
  if (argument('--preset') !== 'U4 Small') throw new Error('Verified factory mapping required');
} else {
  const preset = fs.readFileSync(argument('--fxp'));
  if (sha(preset) !== launch.presetSha256 || launch.presetSha256 !==
      'c9073553f6d62c716b874f15418902d15e58edc97a56f79b112ccb3e4a01e751')
    throw new Error('Verified NY preset required');
}
const midiBytes = fs.readFileSync(argument('--midi'));
const events = readFormatZeroNoteOns(midiBytes).events;
// Parse the validated MIDI a second time to retain controller state at each
// note-on. Controller state is obtained from source bytes, never native ec.
let p = 22, running;
const cc69 = Array(16).fill(0), values = [];
const byte = () => midiBytes[p++];
const vlq = () => { let v = 0, b; do { b = byte(); v = v * 128 + (b & 127); } while (b & 128); return v; };
while (p < midiBytes.length) {
  vlq(); let status = byte();
  if (status < 128) { p--; status = running; }
  if (status === 0xff) { running = undefined; byte(); const n = vlq(); p += n; }
  else if (status === 0xf0 || status === 0xf7) { running = undefined; const n = vlq(); p += n; }
  else {
    running = status; const kind = status >> 4, channel = status & 15;
    const a = byte(), b = [12, 13].includes(kind) ? undefined : byte();
    if (kind === 11 && a === 69) cc69[channel] = b;
    if (kind === 9 && b !== 0) values.push(cc69[channel]);
  }
}
const rows = d.expressionRecords;
if (!celeste && values.some(value => value !== 0))
  throw new Error('NY harmonic controller branch is not covered by this verifier');
if (!rows?.length || rows.length !== events.length || values.length !== events.length ||
    rows.some((r, i) => r.note !== 69 || events[i].note !== 69 || events[i].velocity !== 96))
  throw new Error('Complete chronological A4 velocity-96 observations required');
let checks = 0; const failures = [], predictions = [];
function check(name, own, native) {
  checks++;
  if (!Number.isFinite(own) || !Object.is(own, native)) failures.push({name, own, native});
}
for (const [i, row] of rows.entries()) {
  const profile = {...row.inputs};
  Object.defineProperty(profile, 'ec', {get() { throw new Error('Captured ec read'); }});
  Object.defineProperty(profile, 'targets', {get() { throw new Error('Captured targets read'); }});
  const ownEc = celeste ? scalarMidiCcToEventValue(values[i]) : 0;
  const own = celeste ? celesteVoiceExpressionFromMidi(values[i], profile, {internalParameterId: 14}) :
    voiceExpressionControls({ec: ownEc, f0: profile.f0, f4: profile.f4, mix: profile.mix,
      gain: profile.gain, specialValue: profile.specialValue, flags: profile.flags});
  check(`${i}:ec`, ownEc, row.inputs.ec);
  for (const key of ['u', 'control30', 'lowerControl']) check(`${i}:${key}`, own[key], row.targets[key]);
  predictions.push({cc69: values[i], ec: ownEc, ...own});
}
assert.throws(() => celesteVoiceExpressionFromMidi(127, {}, {internalParameterId: 11}), /Celeste/);
assert.throws(() => celesteVoiceExpressionFromMidi(127, {}), /preset-dependent/);
const result = {schema: 'pianoteq-voice-expression-pass260', passed: !failures.length, checks,
  mismatches: failures.length, failures, invocations: rows.length, factoryPreset: launch.factoryPreset ?? null,
  distinctCc69Values: new Set(values).size, predictions,
  nativeCaptureSha256: sha(captureBytes), launchSha256: sha(launchBytes), midiSha256: sha(midiBytes),
  nativeLogSha256: sha(log), nativeEcOrTargetsUsedAsInput: false,
  profileConfigurationStillObserved: true, fullVoiceAudioVerified: false, browserIntegrationVerified: false};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({...result, failures: undefined, predictions: undefined}));
if (!result.passed) process.exitCode = 1;
