import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {bindArchiveExcitation} from './pianoteq_bind_archive_excitation.mjs';
import {readFormatZeroNoteOns} from './pianoteq_note_on_velocity_source.mjs';
import {archiveExcitationBaseTables} from '../dsp/archive-excitation-base-tables.mjs';
import {constructArchiveSourceContext, prepareArchiveSourceTables} from '../dsp/archive-source-context.mjs';
const [sourceFile, directory, output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw new Error('Usage: current-archive-source native-directory fresh-report');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sourceBytes = fs.readFileSync(sourceFile), source = JSON.parse(sourceBytes), captureBytes = fs.readFileSync(path.join(directory, 'runtime.json'));
const d = JSON.parse(captureBytes), launchBytes = fs.readFileSync(path.join(directory, 'launch.json')), launch = JSON.parse(launchBytes), log = fs.readFileSync(path.join(directory, 'lldb.log'));
bindArchiveExcitation(sourceBytes, sha(captureBytes));
if (source.presetSha256 !== launch.presetSha256 || d.targetMutation !== false || d.hardwareBreakpoints !== 1 ||
    d.runStatus?.terminal !== true || d.runStatus.exitStatus !== 0 || !Array.isArray(d.errors) || d.errors.length ||
    !Array.isArray(d.baseTableErrors) || d.baseTableErrors.length || /could not read|corrupt (?:FXP file|archive)|marap_oo\.hh/i.test(log.toString()))
  throw new Error('Bound current preset and complete error-free read-only observation required');
function argument(name) {
  if (launch.arguments?.filter(x => x === name).length !== 1) throw new Error('Unique native argument required: ' + name);
  return launch.arguments[launch.arguments.indexOf(name) + 1];
}
if (argument('--fxp') !== source.presetPath || argument('--rate') !== '48000') throw new Error('Exact native preset and rate required');
const midiBytes = fs.readFileSync(argument('--midi')), events = readFormatZeroNoteOns(midiBytes).events;
const rows = d.baseTableRecords;
if (!rows?.length || rows.some(r => r.stage !== 'active' || r.sampleRate !== 48000) || events.length !== 5 ||
    rows.length !== events.length * 2 || rows.some((r, i) => r.note !== events[Math.floor(i / 2)].note || r.mode !== i % 2))
  throw new Error('Chronological two-mode MIDI observations at exact sample rate required');
const eventNotes = new Set(events.map(e => e.note));
const runtime = JSON.parse(fs.readFileSync(source.contextPath)).runtime;
const context = constructArchiveSourceContext({baseFields: source.baseFields, presetFields: source.presetFields, ...runtime.tuning});
function prepare(note) {
  const options = structuredClone(runtime.sourceOptions[0]);
  const preset = source.presetFields.find(r => r.object_offset === 0x9a8)?.value?.grid;
  const base = source.baseFields.find(r => r.object_offset === 0x1018)?.value?.rows;
  if (!preset || !base) throw new Error('Complete harmonic grids required');
  options.weightSource.harmonicCurveModes = {preset: preset.map(() => options.weightSource.harmonicCurveMode),
    base: base.map(() => options.weightSource.harmonicCurveMode)};
  delete options.weightSource.harmonicCurveMode;
  const primary = prepareArchiveSourceTables(context, {...options, note, noteIndex: note});
  return {primary, tables: archiveExcitationBaseTables({baseFields: source.baseFields, note, primarySource: primary})};
}
const predictions = new Map(), failures = []; let checks = 0;
const perNote = Object.fromEntries([...eventNotes].map(note => [note, {checks: 0, mismatches: 0}]));
const observedFrequencyDiagnostic = {nativeFrequencyUsedAsInput: true, affectsStrictPass: false, checks: 0, mismatches: 0};
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
  const {primary, tables} = predictions.get(r.note);
  // Isolate interpolation from a possible source-frequency producer defect.
  // These predictions never replace the strict independently generated ones.
  const diagnostic = archiveExcitationBaseTables({baseFields: source.baseFields, note: r.note, primarySource: r.initialPrimary});
  for (const key of ['negative', 'positive']) {
    if (diagnostic[key].length !== r.tables[key]?.length) throw new Error('Complete diagnostic table required');
    diagnostic[key].forEach((v, j) => {observedFrequencyDiagnostic.checks++; if (!Object.is(v, r.tables[key][j])) observedFrequencyDiagnostic.mismatches++;});
  }
  check(`${i}:rows`, primary.rows, r.initialPrimary.rows);
  check(`${i}:columns`, primary.columns, r.initialPrimary.columns);
  if (primary.frequency.length !== r.initialPrimary.frequency.length) throw new Error('Complete native initial frequency matrix required');
  Array.from(primary.frequency).forEach((v, j) => check(`${i}:initial-frequency:${j}`, v, r.initialPrimary.frequency[j]));
  for (const key of ['negative', 'positive']) {
    if (tables[key].length !== r.tables[key]?.length) throw new Error('Complete native base table required');
    tables[key].forEach((v, j) => check(`${i}:${key}:${j}`, v, r.tables[key][j]));
  }
  if (tables.coordinates.length !== r.coordinates?.length || !r.selected?.length || r.selected.length > primary.rows)
    throw new Error('Complete coordinates and selected native table required');
  tables.coordinates.forEach((v, j) => check(`${i}:coordinate:${j}`, v, r.coordinates[j]));
  const selected = tables[r.slope > 0 ? 'positive' : 'negative'];
  r.selected.forEach((v, j) => check(`${i}:selected:${j}`, selected[j], v));
}

const result = {schema: 'pianoteq-excitation-base-tables-pass256', passed: !failures.length, checks, mismatches: failures.length, failures,
  distinctEventNotes: eventNotes.size, eventNotes: [...eventNotes], activeInvocations: rows.length,
  distinctActiveSources: new Set(rows.map(r => r.source)).size, configuredRecords: 0,
  predictions: [...predictions].map(([note, value]) => ({note, rows: value.primary.rows, columns: value.primary.columns, tables: value.tables})),
  sourceSha256: sha(sourceBytes), nativeCaptureSha256: sha(captureBytes), launchSha256: sha(launchBytes), nativeLogSha256: sha(log), midiSha256: sha(midiBytes),
  actualBothModeBaseTableConsumersObserved: true, nativeTargetsUsedForStrictPredictions: false,
  observedFrequencyDiagnostic, perNote,
  positiveSlopeConsumerVerified: rows.some(r => r.slope > 0),
  initialFrequencyComputedFromArchive: true, nativeSlopeUsedOnlyToChooseComparisonTargetFamily: true,
  parentSoundboardCaptureComplete: d.completed === true, audioSamplesComparedHere: 0, finalStereoAudioVerified: false};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({...result, predictions: undefined, failures: undefined}));
if (!result.passed) process.exitCode = 1;
