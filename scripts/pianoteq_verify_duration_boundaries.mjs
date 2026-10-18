// Audit only the explicitly observed normal-instrument, disabled-variation branch.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {archiveDampingDuration} from '../dsp/archive-damping-duration.mjs';
import {constructArchiveDurationTuning, archiveReleaseDuration} from '../dsp/archive-release-duration.mjs';
import {bindDurationSource} from './pianoteq_bind_duration_source.mjs';

const [sourceFile, directory, reportFile, ...extra] = process.argv.slice(2);
if (!sourceFile || !directory || !reportFile || extra.length)
  throw new Error('Usage: private-duration-source.json private-native-directory fresh-report.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceBytes = fs.readFileSync(sourceFile), source = JSON.parse(sourceBytes);
const computedFrequency = source.schema === 'pianoteq-duration-archive-inputs-v2';
const ownTuning = computedFrequency ? constructArchiveDurationTuning(bindDurationSource(sourceBytes)) : undefined;
const captureBytes = fs.readFileSync(path.join(directory, 'runtime.json')), capture = JSON.parse(captureBytes);
const launchBytes = fs.readFileSync(path.join(directory, 'launch.json')), launch = JSON.parse(launchBytes);
const log = fs.readFileSync(path.join(directory, 'lldb.log'));
if ((!computedFrequency && source.schema !== 'pianoteq-duration-archive-inputs-v1') ||
    sha(fs.readFileSync(source.presetPath)) !== source.presetSha256 ||
    sha(fs.readFileSync(source.resourcePath)) !== source.resourceSha256 ||
    launch.presetSha256 !== source.presetSha256 || launch.presetPath !== source.presetPath ||
    launch.arguments?.filter(x => x === '--fxp').length !== 1 ||
    launch.arguments[launch.arguments.indexOf('--fxp') + 1] !== source.presetPath)
  throw new Error('Current resource and exact native preset binding required');
if (capture.targetMutation !== false || capture.hardwareBreakpoints !== 4 ||
    capture.runStatus?.terminal !== true || capture.runStatus.exitStatus !== 0 ||
    !Array.isArray(capture.errors) || capture.errors.length ||
    !Array.isArray(capture.durationErrors) || capture.durationErrors.length ||
    /could not read|corrupt (?:FXP file|archive)|marap_oo\.hh/i.test(log.toString()))
  throw new Error('Terminal error-free read-only duration observation required');
const records = capture.durationRecords;
if (!Array.isArray(records) || records.some(r => !['getter', 'floor', 'voice', 'initialized'].includes(r.stage)))
  throw new Error('Explicit duration stages required');
const stages = Object.fromEntries(['getter', 'floor', 'voice', 'initialized'].map(s => [s, records.filter(r => r.stage === s)]));
if (!stages.getter.length || stages.getter.length !== stages.floor.length ||
    stages.voice.length !== 5 || stages.initialized.length !== 5 ||
    new Set(stages.voice.map(r => r.H)).size !== 5 || new Set(stages.initialized.map(r => r.H)).size !== 5)
  throw new Error('Complete getter/floor coverage and five unique paired voices required');
const notes = new Set(records.map(r => r.note));
if (notes.size !== 1 || !Number.isFinite([...notes][0])) throw new Error('Single explicit observed note required');
const prediction = archiveDampingDuration({...source, note: [...notes][0]});
const ownDuration = computedFrequency ? archiveReleaseDuration(source, ownTuning, prediction.note) : undefined;
if (prediction.conditionActive) throw new Error('Active condition branch requires a separate native validation');
const f = Math.fround, failures = [], words = new DataView(new ArrayBuffer(4));
const bits = v => {
  if (!Number.isFinite(v) || !Object.is(f(v), v)) throw new Error('Finite float32 boundary required');
  words.setFloat32(0, v); return words.getUint32(0);
};
let checks = 0;
function check(name, own, actual) {
  checks++;
  if (bits(own) !== bits(actual)) failures.push({name, own, actual});
}
for (const [i, r] of stages.getter.entries()) check(`getter:${i}`, prediction.duration, r.duration);
function floored(r) {
  if (r.specialInstrument !== 0 || !Number.isFinite(r.minimumFrequencyControl))
    throw new Error('Only the explicitly observed normal-instrument branch is supported');
  if (ownDuration) check('own-frequency', ownDuration.frequency, r.minimumFrequencyControl);
  const frequency = ownDuration ? ownDuration.frequency : r.minimumFrequencyControl;
  return Math.max(prediction.duration, frequency > 0 ? f(2 / frequency) : 0);
}
for (const [i, r] of stages.floor.entries()) check(`floor:${i}`, floored(r), r.duration);
for (const [i, r] of stages.voice.entries()) {
  if (r.randomConfig?.enabled !== 0) throw new Error('Enabled per-voice variation is not validated here');
  const target = stages.initialized.find(t => t.H === r.H);
  if (!target || target.G !== r.G) throw new Error('Same native voice/source initialization required');
  const duration = floored(r), voiceDuration = Math.min(15, Math.max(f(.01), duration));
  check(`source:${i}`, duration, r.sourceDuration);
  check(`voice:${i}`, voiceDuration, r.duration);
  check(`initialized:${i}`, voiceDuration, target.duration);
}
const report = {
  schema: computedFrequency ? 'pianoteq-duration-boundaries-pass250' : 'pianoteq-duration-boundaries-pass249', passed: failures.length === 0,
  checks, mismatches: failures.length, failures, note: prediction.note, voices: 5,
  predictedGetterDuration: prediction.duration,
  predictionSha256: sha(Buffer.from(JSON.stringify(computedFrequency ? {prediction, ownDuration} : prediction))),
  archiveSourceSha256: sha(sourceBytes), nativeCaptureSha256: sha(captureBytes),
  nativeLaunchSha256: sha(launchBytes), nativeLogSha256: sha(log),
  resourceSha256: source.resourceSha256, presetSha256: source.presetSha256,
  nativeProcessTerminal: true, durationStageCoverageVerified: true,
  parentSoundboardCaptureComplete: capture.completed === true,
  runtimeCurveModeStillAssumed: source.runtimeCurveModeStillAssumed,
  frequencyInputStillObserved: !computedFrequency, ownDuration,
  registryAndCurveModesStillObserved: computedFrequency,
  activeFrequencyFloorVerified: computedFrequency && ownDuration.minimum > ownDuration.getterDuration,
  specialInstrumentBranchVerified: false, enabledVoiceVariationVerified: false,
  activeConditionBranchVerified: false, continuousChainDurationReplaced: false,
  audioSamplesCompared: 0, finalStereoAudioVerified: false,
};
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({...report, failures: undefined}));
if (!report.passed) process.exitCode = 1;
