// Diagnostic only: observed voice endpoints/control production remain inputs.
import fs from 'node:fs';
import path from 'node:path';
import { ObservedVoiceStereo64 } from '../dsp/observed-voice-stereo.mjs';
import { encodeObservedPcm24 } from '../dsp/pcm24.mjs';
import { loadOrderFixture, sha, numericalHash } from './pianoteq_order_fixture.mjs';

const [directory, reportPath, packPath, drivePath, ...flags] = process.argv.slice(2);
const orderFlags = flags.filter(x => x.startsWith('--order-from='));
if (!drivePath || flags.some(x => x !== '--poison-pcm-target' && !x.startsWith('--order-from=')) || new Set(flags).size !== flags.length || orderFlags.length > 1 || fs.existsSync(reportPath) ||
    path.resolve(reportPath).startsWith(path.resolve('.') + path.sep))
  throw Error('Usage: complete-private-run fresh-private-report independent-ir-pack static-drive-profile [--poison-pcm-target]');
const fixture = loadOrderFixture(directory), packBytes = fs.readFileSync(packPath), driveBytes = fs.readFileSync(drivePath);
const pack = JSON.parse(packBytes), driveProfile = JSON.parse(driveBytes);
if (pack.source?.kind !== 'independent-archive-generation' || pack.source.nativeCapturesUsedForPrediction !== false ||
    pack.source.presetSha256 !== fixture.fixture.selection.sha256 || pack.source.resourceSha256 !== fixture.fixture.resourceSha256)
  throw Error('Independently generated IR pack bound to same preset/resources required');
if (driveProfile.schema !== 1 || driveProfile.kind !== 'captured-static-drive-profile' || driveProfile.source?.nativeDynamicSnapshotsExported !== false ||
    driveProfile.source.presetSha256 !== fixture.fixture.selection.sha256 || driveProfile.source.resourceSha256 !== fixture.fixture.resourceSha256)
  throw Error('Static drive profile bound to same preset/resources required');
const targetFixture = orderFlags.length ? loadOrderFixture(orderFlags[0].slice('--order-from='.length)) : fixture;
let changedOrderBlocks = 0;
if (targetFixture !== fixture) {
  if (numericalHash(fixture.fixture) !== numericalHash(targetFixture.fixture) ||
      numericalHash(fixture.profile) !== numericalHash(targetFixture.profile) || numericalHash(fixture.controls) !== numericalHash(targetFixture.controls) ||
      numericalHash(fixture.writers) !== numericalHash(targetFixture.writers) || fixture.voices.size !== targetFixture.voices.size)
    throw Error('Order-only premise rejected: configuration or numerical controls differ');
  for (const [id, voice] of fixture.voices) if (!targetFixture.voices.has(id) || numericalHash(voice) !== numericalHash(targetFixture.voices.get(id)))
    throw Error('Order-only premise rejected: keyed voice endpoint differs at ' + id);
  fixture.order.forEach((ids, block) => {
    if (JSON.stringify([...ids].sort()) !== JSON.stringify([...targetFixture.order[block]].sort())) throw Error('Order-only premise rejected: block inventory differs');
    if (JSON.stringify(ids) !== JSON.stringify(targetFixture.order[block])) changedOrderBlocks++;
  });
  if (!changedOrderBlocks || fixture.pcm.equals(targetFixture.pcm)) throw Error('Distinct order and native PCM required for causal experiment');
}
const engine = new ObservedVoiceStereo64(fixture.profile, pack, driveProfile);
const stages = {}, failures = [], blocks = [];
const word = new DataView(new ArrayBuffer(4));
const bits = x => { if (!Number.isFinite(x)) throw Error('Finite DSP output required'); word.setFloat32(0, x, true); return word.getUint32(0, true); };
function compare(name, predicted, target, block) {
  if (predicted.length !== target.length || predicted.some((row, i) => row.length !== target[i].length)) throw Error('Complete signal shape required: ' + name);
  const stats = stages[name] ??= { checks: 0, mismatches: 0 };
  for (let row = 0; row < predicted.length; row++) for (let sample = 0; sample < predicted[row].length; sample++) {
    stats.checks++;
    if (bits(predicted[row][sample]) !== bits(target[row][sample])) {
      stats.mismatches++;
      if (failures.length < 30) failures.push({ name, block, row, sample, predicted: predicted[row][sample], target: target[row][sample] });
    }
  }
}
function checkState(name, predicted, target, block, index) {
  const stats = stages[name] ??= { checks: 0, mismatches: 0 }; stats.checks++;
  if (!Object.is(predicted, target)) {
    stats.mismatches++;
    if (failures.length < 30) failures.push({ name, block, index, predicted, target });
  }
}
const floatHash = values => sha(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
for (let block = 0; block < fixture.order.length; block++) {
  const own = engine.process64(targetFixture.order[block].map(id => fixture.voices.get(id)), fixture.controls[block]);
  const target = targetFixture.target(block);
  for (const [name, rows] of Object.entries(target)) compare(name, ArrayBuffer.isView(own[name]) ? [own[name]] : own[name], rows, block);
  const states = targetFixture.states(block);
  engine.keys.forEach((model, i) => {
    checkState('key-state', floatHash(model.states), states.keys[i].stateSha256, block, i);
    checkState('key-previous', bits(model.previousInput), bits(states.keys[i].previousInput), block, i);
    checkState('key-sleep', model.sleeping, states.keys[i].sleeping, block, i);
  });
  engine.modal.forEach((model, i) => {
    checkState('modal-state', floatHash(model.states), states.modal[i].statesSha256, block, i);
    checkState('modal-counter', model.counter, states.modal[i].counter, block, i);
    checkState('modal-previous', bits(model.previousInput), bits(states.modal[i].previousInput), block, i);
  });
  engine.filters.forEach((model, i) => {
    checkState('lattice-state', floatHash(model.ring), states.lattice[i].ringSha256, block, i);
    checkState('lattice-write', model.write, states.lattice[i].write, block, i);
    checkState('lattice-read', model.read, states.lattice[i].read, block, i);
  });
  blocks.push(own.stereo);
  if (block % 256 === 0) process.stderr.write(`block ${block}\n`);
}
const pcmParts = [];
for (const [index, writer] of fixture.writers.entries()) {
  const rows = [new Float32Array(256), new Float32Array(256)], first = writer.afterGlobalBlocks - 4;
  for (let b = 0; b < 4; b++) for (let row = 0; row < 2; row++) rows[row].set(blocks[first + b][row], b * 64);
  compare('writer', rows, targetFixture.writerTarget(index), first);
  pcmParts.push(Buffer.from(encodeObservedPcm24(rows)));
}
const pcm = Buffer.concat(pcmParts), target = Buffer.from(targetFixture.pcm);
if (flags.includes('--poison-pcm-target')) target[0] ^= 1;
if (pcm.length !== target.length) throw Error('Complete native PCM extent required');
let pcmSampleDifferences = 0;
for (let i = 0; i < pcm.length; i += 3) if (pcm.readUIntLE(i, 3) !== target.readUIntLE(i, 3)) pcmSampleDifferences++;
const report = { schema: 1, captureRuntimeSha256: fixture.runtimeSha256, irPackSha256: sha(packBytes), driveProfileSha256: sha(driveBytes),
  targetRuntimeSha256: targetFixture.runtimeSha256, changedOrderBlocks, orderOnlyCounterfactual: targetFixture !== fixture,
  profileSha256: numericalHash(fixture.profile), controlsSha256: numericalHash(fixture.controls), computedLevelChecks: fixture.computedLevelChecks,
  internalBlocks: blocks.length, writerSpans: fixture.writers.length, exportedFrames: pcm.length / 6, stages, failures,
  mismatches: Object.values(stages).reduce((n, s) => n + s.mismatches, 0) + pcmSampleDifferences,
  computedPcmSha256: sha(pcm), targetPcmSha256: sha(target), pcmSampleDifferences, poisonedPcmTarget: flags.includes('--poison-pcm-target'),
  downstreamHistoriesOwned: true, nativeGlobalIntermediateAudioUsedForPrediction: false,
  nativeInitialKeySleepFlagsUsedForPrediction: false, nativeInitialKeyHistoryGeometryUsedForPrediction: false,
  keyColdInitialization: 'zero interleaved pairs padded to four floats; dormant; previous input zero',
  nativeVoiceAudioUsedForPrediction: true, nativeControlAndCoefficientProductionUsedForPrediction: true,
  captureFreeMidiToStereoVerified: false, nativeRepeatabilityExplained: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ reportPath, mismatches: report.mismatches, pcmSampleDifferences, computedPcmSha256: report.computedPcmSha256 }));
if (report.mismatches) process.exitCode = 1;
