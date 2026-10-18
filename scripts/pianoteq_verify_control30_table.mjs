import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {bindArchiveExcitation} from './pianoteq_bind_archive_excitation.mjs';
import {readFormatZeroNoteOns} from './pianoteq_note_on_velocity_source.mjs';
import {archiveExcitationControl30} from '../dsp/archive-excitation-control30.mjs';
import {constructArchiveSourceContext} from '../dsp/archive-source-context.mjs';
import {prepareArchiveExcitationInitialSources} from '../dsp/archive-excitation-initial-sources.mjs';
const [sourceFile, directory, output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw new Error('Usage: current-archive-source native-directory fresh-report');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sourceBytes = fs.readFileSync(sourceFile), source = JSON.parse(sourceBytes), captureBytes = fs.readFileSync(path.join(directory, 'runtime.json'));
const d = JSON.parse(captureBytes), launchBytes = fs.readFileSync(path.join(directory, 'launch.json')), launch = JSON.parse(launchBytes), log = fs.readFileSync(path.join(directory, 'lldb.log'));
bindArchiveExcitation(sourceBytes, sha(captureBytes));
if (source.presetSha256 !== launch.presetSha256 || d.targetMutation !== false || d.hardwareBreakpoints !== 1 ||
    d.runStatus?.terminal !== true || d.runStatus.exitStatus !== 0 || !Array.isArray(d.errors) || d.errors.length ||
    !Array.isArray(d.control30Errors) || d.control30Errors.length || /could not read|corrupt (?:FXP file|archive)|marap_oo\.hh/i.test(log.toString()))
  throw new Error('Bound current preset and complete error-free read-only observation required');
function argument(name) {
  if (launch.arguments?.filter(x => x === name).length !== 1) throw new Error('Unique native argument required: ' + name);
  return launch.arguments[launch.arguments.indexOf(name) + 1];
}
if (argument('--fxp') !== source.presetPath || argument('--rate') !== '48000') throw new Error('Exact native preset and rate required');
const midiBytes = fs.readFileSync(argument('--midi')), events = readFormatZeroNoteOns(midiBytes).events;
const rows = d.control30Records;
if (!rows?.length || rows.some(r => r.stage !== 'active' || r.sampleRate !== 48000) || events.length < 1 || events.length > 88 ||
    rows.length !== events.length * 2 || rows.some((r, i) => r.note !== events[Math.floor(i / 2)].note || r.mode !== i % 2))
  throw new Error('Chronological two-mode MIDI observations at exact sample rate required');
const eventNotes = new Set(events.map(e => e.note));
const runtime = JSON.parse(fs.readFileSync(source.contextPath)).runtime;
const context = constructArchiveSourceContext({baseFields: source.baseFields, presetFields: source.presetFields, ...runtime.tuning});
function prepare(note) {
  const sources = prepareArchiveExcitationInitialSources({context, baseFields: source.baseFields,
    presetFields: source.presetFields, sourceOptions: runtime.sourceOptions, instrumentMode: runtime.instrumentMode, note});
  const rows = sources.get(0).rows;
  return {rows, ...archiveExcitationControl30({baseFields: source.baseFields, presetFields: source.presetFields, note, rows})};
}
const predictions = new Map(), failures = []; let checks = 0;
const perNote = Object.fromEntries([...eventNotes].map(note => [note, {checks: 0, mismatches: 0}]));
function check(name, own, actual) {
  const note = rows[Number(name.split(':')[0])].note;
  checks++; perNote[note].checks++;
  if (!Number.isFinite(own) || !Number.isFinite(actual) || !Object.is(own, actual)) {
    failures.push({name, own, actual}); perNote[note].mismatches++;
  }
}
for (const [i, r] of rows.entries()) {
  if (!eventNotes.has(r.note)) throw new Error('Explicit requested note required');
  if (!predictions.has(r.note)) predictions.set(r.note, prepare(r.note));
  const own = predictions.get(r.note);
  for (const key of ['rows', 'rawCenter', 'widthInput', 'strength']) check(`${i}:${key}`, own[key], r[key]);
  if (own.table.length !== r.table?.length) throw new Error('Complete native control30 table required');
  own.table.forEach((v, j) => check(`${i}:table:${j}`, v, r.table[j]));
}

const result = {schema: 'pianoteq-control30-spectrum-pass259', passed: !failures.length, checks, mismatches: failures.length, failures,
  eventNotes: [...eventNotes], distinctEventNotes: eventNotes.size, activeInvocations: rows.length, perNote,
  predictions: [...predictions].map(([note, model]) => ({note, ...model})),
  sourceSha256: sha(sourceBytes), nativeCaptureSha256: sha(captureBytes), launchSha256: sha(launchBytes), nativeLogSha256: sha(log), midiSha256: sha(midiBytes),
  nativeTargetsUsedAsInput: false, rowCountsFromOwnPrimarySources: true, runtimeSourceOptionsStillExplicit: true,
  activeNonzeroControlInvocations: rows.filter(r => r.activeControl !== 0).length,
  activeControlAudioVerified: false, audioSamplesComparedHere: 0, finalStereoAudioVerified: false};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({...result, predictions: undefined, failures: undefined}));
if (!result.passed) process.exitCode = 1;
