import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {bindArchiveExcitation} from './pianoteq_bind_archive_excitation.mjs';
import {readFormatZeroNoteOns} from './pianoteq_note_on_velocity_source.mjs';
import {constructArchiveSourceContext, archiveTunedNote} from '../dsp/archive-source-context.mjs';
import {archiveExcitationHistory} from '../dsp/archive-excitation-history.mjs';
const [sourceFile, directory, output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw new Error('Usage: current-archive-source native-directory fresh-report');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sourceBytes = fs.readFileSync(sourceFile), source = JSON.parse(sourceBytes), captureBytes = fs.readFileSync(path.join(directory, 'runtime.json'));
const d = JSON.parse(captureBytes), launchBytes = fs.readFileSync(path.join(directory, 'launch.json')), launch = JSON.parse(launchBytes), log = fs.readFileSync(path.join(directory, 'lldb.log'));
bindArchiveExcitation(sourceBytes, sha(captureBytes));
if (source.presetSha256 !== launch.presetSha256 || d.targetMutation !== false || d.hardwareBreakpoints !== 2 ||
    d.runStatus?.terminal !== true || d.runStatus.exitStatus !== 0 || !Array.isArray(d.errors) || d.errors.length ||
    !Array.isArray(d.historyErrors) || d.historyErrors.length || /could not read|corrupt (?:FXP file|archive)|marap_oo\.hh/i.test(log.toString()))
  throw new Error('Bound current preset and complete error-free read-only observation required');
function argument(name) {
  if (launch.arguments?.filter(x => x === name).length !== 1) throw new Error('Unique native argument required: ' + name);
  return launch.arguments[launch.arguments.indexOf(name) + 1];
}
if (argument('--fxp') !== source.presetPath || argument('--rate') !== '48000') throw new Error('Exact native preset and rate required');
const midiBytes = fs.readFileSync(argument('--midi')), events = readFormatZeroNoteOns(midiBytes).events;
const rows = d.historyRecords, ordinary = rows?.filter(r => r.stage === 'ordinary'), configured = rows?.filter(r => r.stage === 'configured');
if (!rows?.length || rows.some(r => !['ordinary', 'configured'].includes(r.stage)) || events.length !== 5 || ordinary.length !== 5 || !configured.length ||
    ordinary.some((r, i) => r.note !== events[i].note) || events.some(e => !configured.some(r => r.note === e.note)))
  throw new Error('Five chronological MIDI/ordinary observations and configured source coverage required');
const eventNotes = new Set(events.map(e => e.note));
if (eventNotes.size === 1 && new Set(ordinary.map(r => r.host)).size !== 5) throw new Error('Five distinct repeated A4 hosts required');
const runtime = JSON.parse(fs.readFileSync(source.contextPath)).runtime;
const context = constructArchiveSourceContext({baseFields: source.baseFields, presetFields: source.presetFields, ...runtime.tuning});
const predictions = new Map(), failures = []; let checks = 0;
function check(name, own, actual) {
  checks++; if (!Number.isFinite(own) || !Number.isFinite(actual) || !Object.is(own, actual)) failures.push({name, own, actual});
}
for (const [i, r] of rows.entries()) {
  if (!eventNotes.has(r.note)) throw new Error('Explicit requested note required');
  if (!predictions.has(r.note)) predictions.set(r.note, {model: archiveExcitationHistory({baseFields: source.baseFields,
    note: r.note, sampleRate: 48000, noteBranch: 'ordinary'}), frequency: archiveTunedNote(context, {note: r.note}).frequency});
  const {model: p, frequency} = predictions.get(r.note);
  check(`${i}:frequency`, frequency, r.frequency);
  for (const key of ['positiveGain', 'negativeGain']) check(`${i}:${key}`, p.hardnessControls[key], r[key]);
  for (const [key, v] of Object.entries(p.repeatedFields)) check(`${i}:${key}`, v, r.repeatedFields[key]);
  check(`${i}:history-blend`, p.historyControls.blend, r.historyBlend);
  for (const key of ['x', 'y']) {
    if (p.historyCurve[key].length !== r.historyCurve[key].length) throw new Error('Complete actual history curve required');
    p.historyCurve[key].forEach((v, j) => check(`${i}:curve-${key}:${j}`, v, r.historyCurve[key][j]));
  }
  for (const key of ['dimension', 'log_x', 'special_mode']) check(`${i}:curve-${key}`, p.historyCurve[key], r.historyCurve[key]);
  if (r.stage === 'ordinary') {check(`${i}:ordinary-direction`, p.hardnessControls.direction, r.direction); check(`${i}:ordinary-scale`, 1, r.noteScale);}
}
const result = {schema: 'pianoteq-excitation-history-pass253', passed: !failures.length, checks, mismatches: failures.length, failures,
  distinctEventNotes: eventNotes.size, eventNotes: [...eventNotes], ordinaryInvocations: ordinary.length,
  distinctHostAddresses: new Set(ordinary.map(r => r.host)).size, configuredRecords: configured.length,
  predictions: [...predictions].map(([note, value]) => ({note, ...value})),
  sourceSha256: sha(sourceBytes), nativeCaptureSha256: sha(captureBytes), launchSha256: sha(launchBytes), nativeLogSha256: sha(log), midiSha256: sha(midiBytes),
  actualOrdinaryBranchObserved: true, nativeHistoryAndControlTargetsUsedAsInput: false,
  positiveOrNegativeDirectionActiveVerified: false, differingMemberXCoordinatesVerified: false,
  parentSoundboardCaptureComplete: d.completed === true, audioSamplesComparedHere: 0, finalStereoAudioVerified: false};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({...result, predictions: undefined, failures: undefined}));
if (!result.passed) process.exitCode = 1;
