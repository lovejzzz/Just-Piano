// Fresh native observation targets never supply curve, velocity or blend inputs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {bindArchiveExcitation} from './pianoteq_bind_archive_excitation.mjs';
import {archiveExcitationBlend} from '../dsp/archive-excitation-blend.mjs';
const [sourceFile, pitchFile, directory, output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw new Error('Usage: archive-source current-pitch-source native-directory fresh-report');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const bytes = fs.readFileSync(sourceFile), source = JSON.parse(bytes), pitchBytes = fs.readFileSync(pitchFile), pitch = JSON.parse(pitchBytes);
const captureBytes = fs.readFileSync(path.join(directory, 'runtime.json')), capture = JSON.parse(captureBytes);
const launchBytes = fs.readFileSync(path.join(directory, 'launch.json')), launch = JSON.parse(launchBytes), log = fs.readFileSync(path.join(directory, 'lldb.log'));
if (pitch.schema !== 'pianoteq-archive-voice-pitch-inputs-v2' || source.presetSha256 !== pitch.presetSha256 ||
    source.resourceSha256 !== pitch.sources?.resourceSha256 || launch.presetSha256 !== source.presetSha256 ||
    launch.arguments?.filter(x => x === '--fxp').length !== 1 ||
    launch.arguments[launch.arguments.indexOf('--fxp') + 1] !== source.presetPath ||
    capture.targetMutation !== false || capture.hardwareBreakpoints !== 3 || capture.runStatus?.terminal !== true ||
    capture.runStatus.exitStatus !== 0 || !Array.isArray(capture.errors) || capture.errors.length ||
    !Array.isArray(capture.blendErrors) || capture.blendErrors.length ||
    /could not read|corrupt (?:FXP file|archive)|marap_oo\.hh/i.test(log.toString()))
  throw new Error('Exact current preset/resource and terminal error-free native observation required');
const producer = bindArchiveExcitation(bytes, sha(captureBytes)), records = capture.blendRecords;
if (!Array.isArray(records) || records.some(r => !['shared-first', 'curve-copy', 'voice'].includes(r.stage)))
  throw new Error('Explicit blend observation stages required');
const voices = records.map((r, index) => ({...r, index})).filter(r => r.stage === 'voice');
if (voices.length !== 5 || new Set(voices.map(r => r.host)).size !== 5 || voices.some(r => r.note !== 69))
  throw new Error('Five distinct A4 voice boundaries required');
let checks = 0; const failures = [], activeContexts = new Set(), predictions = [];
const word = new DataView(new ArrayBuffer(4));
function check(name, own, actual) {
  if (!Number.isFinite(own) || !Number.isFinite(actual)) throw new Error('Finite blend boundary required');
  checks++; word.setFloat32(0, own); const a = word.getUint32(0); word.setFloat32(0, actual);
  if (a !== word.getUint32(0)) failures.push({name, own, actual});
}
const curve = source.baseFields.find(r => r.object_offset === 0x19c8).value;
const scalar = source.presetFields.find(r => r.object_offset === 0x9a8).value.scalars[4];
function compareCurve(name, target) {
  for (const axis of ['x', 'y']) {
    if (target?.[axis]?.length !== curve[axis].length) throw new Error('Complete actual blend curve required');
    curve[axis].forEach((v, i) => check(`${name}:${axis}:${i}`, v, target[axis][i]));
  }
  for (const [key, v] of Object.entries({dimension: 1, log_x: 0, special_mode: 0})) check(`${name}:${key}`, v, target[key]);
}
for (const [epoch, voice] of voices.entries()) {
  const velocity = producer.beginVelocity({stage: 'before', epoch, note: 69});
  const own = archiveExcitationBlend({baseFields: source.baseFields, presetFields: source.presetFields,
    velocity, velocityRuntime: pitch.velocityRuntime});
  predictions.push({epoch, velocity, ...own});
  check(`${epoch}:velocity`, velocity, voice.velocity);
  for (const key of ['inputBlend', 'blendFloor']) check(`${epoch}:${key}`, own[key], voice[key]);
  own.sharedBlendCoefficients.forEach((v, i) => check(`${epoch}:shared:${i}`, v, voice.coefficients[i]));
  if (!activeContexts.has(voice.shared)) {
    compareCurve('active-shared', voice.activeCurve); activeContexts.add(voice.shared);
  }
}
const initializers = records.slice(0, voices[0].index).filter(r => r.stage === 'shared-first');
const copies = records.slice(0, voices[0].index).filter(r => r.stage === 'curve-copy');
if (!initializers.length || initializers.length !== copies.length) throw new Error('Complete separate builder boundary coverage required');
for (const [i, first] of initializers.entries()) {
  check(`${i}:A9bc`, scalar, first.presetScalar);
  check(`${i}:shared-first`, predictions[0].sharedBlendCoefficients[0], first.actual);
  const copy = copies[i];
  if (copy.shared !== first.shared) throw new Error('Paired builder instance required');
  compareCurve(`${i}:baseCurve`, copy.baseCurve); compareCurve(`${i}:builderCurve`, copy.sharedCurve);
  check(`${i}:base-second`, predictions[0].sharedBlendCoefficients[1], copy.baseSecond);
  predictions[0].sharedBlendCoefficients.forEach((v, j) => check(`${i}:copied:${j}`, v, copy.coefficients[j]));
}
const result = {schema: 'pianoteq-excitation-blend-pass252', passed: !failures.length, checks, mismatches: failures.length, failures,
  voices: voices.length, distinctNotes: 1, builderInitializerContexts: initializers.length, activeSharedContexts: activeContexts.size, predictions,
  activeSharedCurveComparedDirectly: true, builderToActiveConfigurationHandoffVerified: false,
  archiveSourceSha256: sha(bytes), pitchSourceSha256: sha(pitchBytes), nativeCaptureSha256: sha(captureBytes),
  launchSha256: sha(launchBytes), logSha256: sha(log), nativeCurveAndBlendTargetsUsedAsInput: false,
  velocityFromMidiAndForwardManager: true, hostExpressionConditionStillExplicit: true,
  nonzeroBlendFloorNativeVerified: false, parentSoundboardCaptureComplete: capture.completed === true,
  audioSamplesComparedHere: 0, finalStereoAudioVerified: false};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({...result, failures: undefined, predictions: undefined}));
if (!result.passed) process.exitCode = 1;
