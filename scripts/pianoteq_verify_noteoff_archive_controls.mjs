import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {archiveKeyReleaseControls} from '../dsp/archive-key-release-controls.mjs';
import {midiBlockClock} from '../dsp/midi-block-clock.mjs';
import {managerEventCurvesFromArchive, buildManagerEventTables} from '../dsp/manager-event-tables.mjs';
import {mapManagerEventValue, randomizeManagerEventValue} from '../dsp/manager-event-velocity.mjs';
const [sourcePath, capturePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !capturePath || !outputPath || process.argv.length !== 5 || fs.existsSync(outputPath) ||
    path.relative(path.resolve('.'), path.resolve(outputPath)).split(path.sep)[0] !== '..')
  throw new Error('Archive inputs, completed capture and fresh private output required');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceBytes = fs.readFileSync(sourcePath), source = JSON.parse(sourceBytes);
if (source.schema !== 'pianoteq-excitation-archive-inputs-v1' ||
    sha(fs.readFileSync(source.resourcePath)) !== source.resourceSha256 ||
    sha(fs.readFileSync(source.presetPath)) !== source.presetSha256)
  throw new Error('Bound current archive inputs required');
const midi = fs.readFileSync(source.midiPath);
if (sha(midi) !== source.midiSha256) throw new Error('Bound source MIDI required');
const clock = midiBlockClock(midi, source.renderConfiguration);
const events = clock.events.filter(e => e.kind === 'noteOff');
const table = buildManagerEventTables({...managerEventCurvesFromArchive(source),
  useGlobal: false, runtimeMode: 'linear-clamp'}).noteOff;
const captureBytes = fs.readFileSync(capturePath), capture = JSON.parse(captureBytes);
const launchBytes = fs.readFileSync(path.join(path.dirname(capturePath), 'launch.json'));
const launch = JSON.parse(launchBytes), fixture = launch.fixture;
if (fixture.selection.kind !== 'fxp' || fixture.selection.sha256 !== source.presetSha256 ||
    fixture.midiSha256 !== source.midiSha256 || fixture.resourceSha256 !== source.resourceSha256 ||
    launch.site !== '0x1005b5698' || launch.collectorSha256 !== sha(fs.readFileSync(
      path.join(path.dirname(capturePath), '..', 'pianoteq_capture_noteoff_voice_links.py'))))
  throw new Error('Matching native fixture and frozen collector required');
const expectedArguments = [fixture.binaryPath, '--headless', '--no-prefs', '--multicore', '0',
  '--fxp', fixture.selection.path, '--midi', fixture.midiPath, '--wav', path.join(path.dirname(capturePath), 'observed.wav'),
  '--rate', '48000', '--bit-depth', '24', '--dither', 'OFF'];
if (JSON.stringify(expectedArguments) !== JSON.stringify(launch.arguments)) throw new Error('Bound native render arguments required');
if (!capture.runStatus?.terminal || capture.runStatus.exitStatus !== 0 || capture.targetMutation !== false ||
    capture.hardwareBreakpoints !== 1 || capture.noteOffSite !== '0x1005b5698' ||
    capture.errors.length || capture.noteOffErrors.length || capture.noteOffRecords.length !== events.length)
  throw new Error('Complete successful single-site read-only note-off capture required');
let checks = 0; const failures = [];
function check(label, actual, expected) {
  checks++;
  if (!Object.is(actual, expected)) failures.push({label, actual, expected});
}
for (let i = 0; i < events.length; i++) {
  const event = events[i], target = capture.noteOffRecords[i];
  if (event.channel !== 0 || event.note !== 69 || event.velocity !== 0 || target.ordinal !== i)
    throw new Error('Supported channel-zero A4 zero-release-velocity fixture required');
  const controls = archiveKeyReleaseControls({...source, note: event.note, runtimeCurveMode: 'linear-clamp'});
  for (const name of Object.keys(controls)) check(`${i}:${name}`, controls[name], target.controls[name]);
  const release = mapManagerEventValue(randomizeManagerEventValue(0, 0, {kind: 1, eligible: false}), {kind: 1, table});
  check(`${i}:release`, release, target.release);
}
const report = {schema: 'pianoteq-noteoff-archive-controls-v1', passed: failures.length === 0,
  checks, mismatches: failures.length, failures, sourceSha256: sha(sourceBytes), captureSha256: sha(captureBytes),
  launchSha256: sha(launchBytes),
  controlsComputedFromArchive: true, releaseValueComputedFromMidiAndArchive: true,
  keyStateHandoffComputed: false, completeVoiceVerified: false, finalStereoVerified: false};
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({...report, failures: failures.slice(0, 8)}));
if (!report.passed) process.exitCode = 1;
