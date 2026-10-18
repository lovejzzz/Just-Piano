import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { readComputedDrive, readComputedKeyInputs, readComputedBodyBefore } from './pianoteq_feedback_artifact.mjs';
import { GlobalModalRecurrence64 } from '../dsp/global-modal-recurrence.mjs';
import { fma32 } from '../dsp/modal-kernel.mjs';

const [input, destination, ...flags] = process.argv.slice(2);
const outputs = flags.filter(x => x.startsWith('--output-mono='));
if (!input || !destination || outputs.length > 1 || flags.some(x => !['--output-mono=', '--drive-report=', '--drive-audio=', '--key-inputs-report=', '--key-inputs-audio=', '--body-before-report=', '--body-before-audio='].some(p => x.startsWith(p)) && !['--poison-body-target', '--poison-mono-target', '--poison-pre-drive-target', '--poison-body-before-target'].includes(x))) throw Error('Usage: capture fresh-report [--output-mono=NEW_FILE] [--drive-report=REPORT --drive-audio=AUDIO] [--poison-body-target|--poison-mono-target]');
const outputPath = outputs[0]?.slice('--output-mono='.length);
for (const file of [destination, outputPath].filter(Boolean)) if (fs.existsSync(file)) throw Error('Fresh report and output required');
const raw = fs.readFileSync(input), data = JSON.parse(raw);
if (!data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.errors.length || data.pending || data.targetMutation !== false || data.observations.length !== 2320 || Object.keys(data.configs).length !== 3) throw Error('Complete primary mono observation required');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const driveReportPath = flags.find(x => x.startsWith('--drive-report='))?.slice('--drive-report='.length);
const driveAudioPath = flags.find(x => x.startsWith('--drive-audio='))?.slice('--drive-audio='.length);
if (!!driveReportPath !== !!driveAudioPath) throw Error('Paired drive inputs required');
let ownDrive = null;
if (driveReportPath) {
  const root = path.dirname(path.resolve(input)), full = JSON.parse(fs.readFileSync(path.join(root, 'runtime.json')));
  if (full.monoBodySha256 !== sha(raw)) throw Error('Same-run mono sidecar required');
  ownDrive = readComputedDrive(root, full, driveReportPath, driveAudioPath);
}
const keyReportPath = flags.find(x => x.startsWith('--key-inputs-report='))?.slice('--key-inputs-report='.length);
const keyAudioPath = flags.find(x => x.startsWith('--key-inputs-audio='))?.slice('--key-inputs-audio='.length);
if (!!keyReportPath !== !!keyAudioPath || keyReportPath && !ownDrive) throw Error('Computed key inputs require paired computed drive');
const ownKeyInputs = keyReportPath ? readComputedKeyInputs(path.dirname(path.resolve(input)), JSON.parse(fs.readFileSync(path.join(path.dirname(path.resolve(input)), 'runtime.json'))), keyReportPath, keyAudioPath) : null;
if (ownKeyInputs && (ownDrive.keyInputsReportSha256 !== ownKeyInputs.reportSha256 || ownDrive.keyInputsAudioSha256 !== ownKeyInputs.audioSha256)) throw Error('Drive and modal kernels must consume identical computed key inputs');
if (flags.includes('--poison-pre-drive-target') && !ownKeyInputs) throw Error('Computed key inputs required for pre-drive target control');
const beforeReportPath = flags.find(x => x.startsWith('--body-before-report='))?.slice('--body-before-report='.length);
const beforeAudioPath = flags.find(x => x.startsWith('--body-before-audio='))?.slice('--body-before-audio='.length);
if (!!beforeReportPath !== !!beforeAudioPath || beforeReportPath && !ownKeyInputs) throw Error('Computed per-key mono requires paired computed key inputs');
const ownBodyBefore = beforeReportPath ? readComputedBodyBefore(path.dirname(path.resolve(input)), JSON.parse(fs.readFileSync(path.join(path.dirname(path.resolve(input)), 'runtime.json'))), beforeReportPath, beforeAudioPath) : null;
if (ownBodyBefore && (ownBodyBefore.keyInputsReportSha256 !== ownKeyInputs.reportSha256 || ownBodyBefore.keyInputsAudioSha256 !== ownKeyInputs.audioSha256)) throw Error('Per-key and global mono require identical key inputs');
if (flags.includes('--poison-body-before-target') && !ownBodyBefore) throw Error('Computed per-key mono required for target control');
const floatHash = values => {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((x, i) => { if (!Number.isFinite(x)) throw Error('Finite modal data required'); bytes.writeFloatLE(x, i * 4); });
  return sha(bytes);
};
const models = new Map();
for (const [identity, config] of Object.entries(data.configs)) {
  if (floatHash(config.coefficients) !== config.coefficientSha256 || !config.coefficientVersions[config.coefficientSha256]) throw Error('Initial coefficient binding required');
  for (const [hash, values] of Object.entries(config.coefficientVersions)) if (values.length !== config.vectorCount * 16 || floatHash(values) !== hash) throw Error('Complete coefficient version binding required');
  models.set(identity, new GlobalModalRecurrence64(config));
}
let checks = 0, mismatches = 0, poisonedBody = false, poisonedMono = false, poisonedPreDrive = false, poisonedBefore = false, coefficientChanges = 0;
let nonzeroBody = 0, nonzeroMono = 0, nonzeroBefore = 0, nonzeroDirect = 0, queueBlocks = 0;
let bodyOutputTargetBlocks = 0;
const mismatchCounts = { state: 0, body: 0, mono: 0, input: 0 };
const failures = [], parts = [], versions = new Map(Object.entries(data.configs).map(([id, c]) => [id, c.coefficientSha256]));
const word = new DataView(new ArrayBuffer(4));
const bits = x => { if (!Number.isFinite(x)) throw Error('Finite mono sample required'); word.setFloat32(0, x, true); return word.getUint32(0, true); };
function check(a, b, label) { checks++; if (!Object.is(a, b)) { mismatches++; mismatchCounts[label.includes('.mono.') ? 'mono' : label.includes('.body.') ? 'body' : label.includes('.drive.') || label.includes('.modifiedInput.') ? 'input' : 'state']++; if (failures.length < 12) failures.push({ label, actual: b, computed: a }); } }
function state(model, target, label) {
  check(model.counter, target.counter, label + '.counter');
  check(bits(model.previousInput), bits(target.previousInput), label + '.previous');
  check(floatHash(model.states), target.statesSha256, label + '.history');
  check(model.vectorCount, target.vectorCount, label + '.vectors');
  check(target.disabled, 0, label + '.enabled');
}
function rows(name, value) {
  if (value.length !== 1 || value[0].length !== 64) throw Error('Complete mono row required: ' + name);
  value[0].forEach(bits); return value[0];
}
function add(target, source, gain) {
  if (!Number.isFinite(gain)) throw Error('Finite mono gain required');
  if (gain === 0) return target;
  return Float32Array.from(target, (x, i) => fma32(source[i], gain, x));
}
for (const [block, item] of data.observations.entries()) {
  if (item.ordinal !== block || item.dispatch.variant !== 0 || item.dispatch.kernels.length !== 3 || item.after.length !== 3 || item.bodyInputs.length !== 3) throw Error('Complete three-kernel chronology required');
  const beforeTarget = rows('before target', item.bodyBefore), before = ownBodyBefore ? ownBodyBefore.row(block) : beforeTarget;
  if (ownBodyBefore) before.forEach((x, i) => {
    let actual = bits(beforeTarget[i]);
    if (flags.includes('--poison-body-before-target') && !poisonedBefore && x !== 0) { actual = (actual ^ 1) >>> 0; poisonedBefore = true; }
    check(bits(x), actual, `${block}.bodyBefore.${i}`);
  });
  nonzeroBefore += before.filter(x => x !== 0).length;
  let body = Float32Array.from(before);
  const drive = ownDrive ? ownDrive.row(block) : rows('drive scratch', item.driveScratch);
  let modifiedFirst = null;
  if (ownDrive) {
    const actualDrive = rows('drive target', item.driveScratch), beforeTarget = rows('pre-drive source target', item.driveInputBefore), inputBefore = ownKeyInputs ? ownKeyInputs.rows(block)[0] : beforeTarget;
    if (ownKeyInputs) inputBefore.forEach((x, i) => {
      let actual = bits(beforeTarget[i]);
      if (flags.includes('--poison-pre-drive-target') && !poisonedPreDrive && x !== 0) { actual = (actual ^ 1) >>> 0; poisonedPreDrive = true; }
      check(bits(x), actual, `${block}.preDriveInput.${i}`);
    });
    modifiedFirst = Float32Array.from(inputBefore, (x, i) => Math.fround(x + drive[i]));
    const actualFirst = rows('modified source target', item.bodyInputs[0]);
    drive.forEach((x, i) => { check(bits(x), bits(actualDrive[i]), `${block}.drive.${i}`); check(bits(modifiedFirst[i]), bits(actualFirst[i]), `${block}.modifiedInput.${i}`); });
  }
  for (let k = 0; k < 3; k++) {
    const current = item.dispatch.kernels[k], returned = item.after[k], model = models.get(current.object);
    if (!model || current.object !== returned.object || current.target !== '0x100657dfc') throw Error('Bound scalar modal owner required');
    if (versions.get(current.object) !== current.coefficientSha256) {
      const table = data.configs[current.object].coefficientVersions[current.coefficientSha256];
      if (!table) throw Error('Missing coefficient version');
      model.setCoefficients(table); versions.set(current.object, current.coefficientSha256); coefficientChanges++;
    }
    state(model, current, `${block}.${k}.before`);
    const source = k === 0 && modifiedFirst ? modifiedFirst : ownKeyInputs ? ownKeyInputs.rows(block)[k] : rows('body input', item.bodyInputs[k]);
    if (ownKeyInputs && k > 0) source.forEach((x, i) => check(bits(x), bits(item.bodyInputs[k][0][i]), `${block}.${k}.modalInput.${i}`));
    body = model.process64(source, body);
    state(model, returned, `${block}.${k}.after`);
  }
  const bodyTarget = item.bodyOutputObserved === false ? null : rows('body target', item.bodyOutput);
  if (bodyTarget) bodyOutputTargetBlocks++;
  body.forEach((x, i) => {
    if (bodyTarget) {
      let target = bits(bodyTarget[i]);
      if (flags.includes('--poison-body-target') && !poisonedBody && x !== 0) { target ^= 1; poisonedBody = true; }
      check(bits(x), target >>> 0, `${block}.body.${i}`);
    }
    if (x !== 0) nonzeroBody++;
  });
  let mono = body;
  const queue = item.queueReturn;
  if (![0, 1].includes(queue.enabled)) throw Error('Inspected queue flag required');
  if (queue.enabled === 1 && queue.hasFirst) {
    queueBlocks++;
    if (queue.gains.length !== 2 || queue.sources.length !== 2) throw Error('Complete queue return required');
    for (let k = 0; k < 2; k++) mono = add(mono, rows('queue source', queue.sources[k]), queue.gains[k]);
  }
  const direct = rows('direct source', item.directSource);
  nonzeroDirect += direct.filter(x => x !== 0).length;
  // 8dbc80 adds source x1 into destination x0. The direct matrix is a
  // different destination; only the drive scratch is added to the mono body.
  mono = add(mono, drive, item.scratchGain);
  const target = rows('mono target', item.monoTarget);
  mono.forEach((x, i) => {
    let actual = bits(target[i]);
    if (flags.includes('--poison-mono-target') && !poisonedMono && x !== 0) { actual ^= 1; poisonedMono = true; }
    check(bits(x), actual >>> 0, `${block}.mono.${i}`); if (x !== 0) nonzeroMono++;
  });
  parts.push(Buffer.from(mono.buffer, mono.byteOffset, mono.byteLength));
}
const computed = Buffer.concat(parts), passed = mismatches === 0 && nonzeroMono > 0;
const report = { schema: 1, passed, inputSha256: sha(raw), blocks: data.observations.length, checks, mismatches, failures,
  coefficientChanges, nonzeroBody, nonzeroMono, nonzeroBefore, nonzeroDirect, queueBlocks, mismatchCounts, bodyOutputTargetBlocks,
  computedMonoSha256: sha(computed), poisonedBody, poisonedMono, poisonedPreDrive, poisonedBefore,
  statesCarried: true, initialStatesRequiredZero: true, nativeModalHistoryUsedForPrediction: false,
  nativeBodyOutputUsedForPrediction: false, nativePreLatticeMonoUsedForPrediction: false,
  nativeModalInputsAndExistingMonoUsedForPrediction: !ownKeyInputs || !ownBodyBefore, nativeCoefficientVersionsUsedForPrediction: true,
  nativeDriveScratchUsedForPrediction: !ownDrive, nativeFirstModalInputAfterDriveUsedForPrediction: !ownDrive,
  computedKeyInputsSource: !!ownKeyInputs, nativeModalInputAudioUsedForPrediction: !ownKeyInputs, nativeExistingMonoStillObserved: !ownBodyBefore, computedBodyBeforeSource: !!ownBodyBefore,
  computedBodyBeforeReportSha256: ownBodyBefore?.reportSha256 ?? null, computedBodyBeforeAudioSha256: ownBodyBefore?.audioSha256 ?? null,
  computedKeyInputsReportSha256: ownKeyInputs?.reportSha256 ?? null, computedKeyInputsAudioSha256: ownKeyInputs?.audioSha256 ?? null,
  computedLevelsSource: !!ownDrive?.usesComputedLevels,
  computedDriveReportSha256: ownDrive?.reportSha256 ?? null, computedDriveAudioSha256: ownDrive?.audioSha256 ?? null,
  nativeQueueSourcesUsedForPrediction: queueBlocks > 0,
  nativeDirectSourceUsedForPrediction: false, independentEngineStereoVerified: false };
fs.writeFileSync(destination, JSON.stringify(report, null, 2), { flag: 'wx' });
if (outputPath) { if (!passed) throw Error('Only passing mono may export'); fs.writeFileSync(outputPath, computed, { flag: 'wx' }); }
console.log(JSON.stringify(report));
if (!passed || flags.includes('--poison-body-target') && !poisonedBody || flags.includes('--poison-mono-target') && !poisonedMono || flags.includes('--poison-pre-drive-target') && !poisonedPreDrive || flags.includes('--poison-body-before-target') && !poisonedBefore) process.exitCode = 1;
