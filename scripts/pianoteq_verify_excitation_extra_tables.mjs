import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {bindArchiveExcitation} from './pianoteq_bind_archive_excitation.mjs';
import {readFormatZeroNoteOns} from './pianoteq_note_on_velocity_source.mjs';
import {archiveExcitationExtraTables} from '../dsp/archive-excitation-extra-tables.mjs';
const [sourceFile, directory, output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw new Error('Usage: current-archive-source native-directory fresh-report');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sourceBytes = fs.readFileSync(sourceFile), source = JSON.parse(sourceBytes), captureBytes = fs.readFileSync(path.join(directory, 'runtime.json'));
const d = JSON.parse(captureBytes), launchBytes = fs.readFileSync(path.join(directory, 'launch.json')), launch = JSON.parse(launchBytes), log = fs.readFileSync(path.join(directory, 'lldb.log'));
bindArchiveExcitation(sourceBytes, sha(captureBytes));
if (source.presetSha256 !== launch.presetSha256 || d.targetMutation !== false || d.hardwareBreakpoints !== 2 ||
    d.runStatus?.terminal !== true || d.runStatus.exitStatus !== 0 || !Array.isArray(d.errors) || d.errors.length ||
    !Array.isArray(d.extraTableErrors) || d.extraTableErrors.length || /could not read|corrupt (?:FXP file|archive)|marap_oo\.hh/i.test(log.toString()))
  throw new Error('Bound current preset and complete error-free read-only observation required');
function argument(name) {
  if (launch.arguments?.filter(x => x === name).length !== 1) throw new Error('Unique native argument required: ' + name);
  return launch.arguments[launch.arguments.indexOf(name) + 1];
}
if (argument('--fxp') !== source.presetPath || argument('--rate') !== '48000') throw new Error('Exact native preset and rate required');
const midiBytes = fs.readFileSync(argument('--midi')), events = readFormatZeroNoteOns(midiBytes).events;
const rows = d.extraTableRecords, active = rows?.filter(r => r.stage === 'active'), configured = rows?.filter(r => r.stage === 'configured');
if (!rows?.length || rows.some(r => !['active', 'configured'].includes(r.stage)) || events.length !== 5 ||
    active.length !== events.length * 2 || !configured.length ||
    active.some((r, i) => r.note !== events[Math.floor(i / 2)].note || r.mode !== i % 2) ||
    events.some(e => !configured.some(r => r.note === e.note)))
  throw new Error('Chronological two-mode MIDI observations and configured coverage required');
const eventNotes = new Set(events.map(e => e.note));
const predictions = new Map(), failures = []; let checks = 0;
function check(name, own, actual) {
  checks++; if (!Number.isFinite(own) || !Number.isFinite(actual) || !Object.is(own, actual)) failures.push({name, own, actual});
}
for (const [i, r] of rows.entries()) {
  if (!eventNotes.has(r.note)) throw new Error('Explicit requested note required');
  if (!predictions.has(r.note)) predictions.set(r.note, archiveExcitationExtraTables({baseFields: source.baseFields,
    note: r.note, noteBranch: 'ordinary'}));
  const p = predictions.get(r.note);
  for (const [key, value] of Object.entries(p)) {
    if (Array.isArray(value)) {
      if (r.tables[key]?.length !== value.length) throw new Error('Complete native reference vector required');
      value.forEach((v, j) => check(`${i}:${key}:${j}`, v, r.tables[key][j]));
    } else throw new Error('Array table required');
  }
}

const result = {schema: 'pianoteq-excitation-extra-tables-pass255', passed: !failures.length, checks, mismatches: failures.length, failures,
  distinctEventNotes: eventNotes.size, eventNotes: [...eventNotes], activeInvocations: active.length,
  distinctActiveSources: new Set(active.map(r => r.source)).size, configuredRecords: configured.length,
  predictions: [...predictions].map(([note, value]) => ({note, ...value})),
  sourceSha256: sha(sourceBytes), nativeCaptureSha256: sha(captureBytes), launchSha256: sha(launchBytes), nativeLogSha256: sha(log), midiSha256: sha(midiBytes),
  actualBothModeExtraTableConsumersObserved: true, nativeExtraTableTargetsUsedAsInput: false,
  otherExtraTablesVerified: false,
  parentSoundboardCaptureComplete: d.completed === true, audioSamplesComparedHere: 0, finalStereoAudioVerified: false};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({...result, predictions: undefined, failures: undefined}));
if (!result.passed) process.exitCode = 1;
