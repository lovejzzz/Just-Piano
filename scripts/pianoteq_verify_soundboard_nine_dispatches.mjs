#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [nodeDirectory, ...groups] = process.argv.slice(2);
if (!nodeDirectory || groups.length !== 3) throw new Error('Usage: private-node-capture source-capture-0 source-capture-1 source-capture-2');
const script = (name) => fileURLToPath(new URL(name, import.meta.url));
const run = (name, args) => JSON.parse(execFileSync(process.execPath, [script(name), ...args],
  {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024}));
const binding = run('pianoteq_verify_soundboard_dispatch_nodes.mjs', [nodeDirectory]);
if (!binding.passed) throw new Error('Native node binding differs');
const native = JSON.parse(fs.readFileSync(path.join(nodeDirectory, 'runtime.json')));
function readTarget(target) {
  const d = target.data;
  if (!d || path.basename(d.file) !== d.file) throw new Error('Invalid node descriptor');
  const bytes = fs.readFileSync(path.join(nodeDirectory, d.file));
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== d.sha256 || bytes.length !== d.bytes || bytes.length !== target.length * 4) throw new Error('Node descriptor differs');
  return sha256;
}
const groupReports = [], comparisons = [];
for (let group = 0; group < 3; group++) {
  const directory = groups[group], runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
  if ((runtime.selectedDispatch ?? 0) !== group || (group && runtime.sourceEntriesSeen !== group + 1)) {
    throw new Error('Selected source group differs');
  }
  const replay = run('pianoteq_replay_soundboard_responses.mjs', [path.join(directory, 'source.json'), directory]);
  if (!replay.passed || !replay.sameRunCapturedSourceBound || !replay.dispatchComputed ||
      replay.dispatchComparisons?.length !== 3 || replay.nativeBlockCacheUsedForPrediction !== false ||
      replay.spectralNativeTargetsUsedForPrediction !== false) throw new Error('Independent group replay incomplete');
  if (runtime.initializationInputs && (!replay.initializationComputed || replay.sourceExcitationUsedForPrediction !== false ||
      replay.sourceGridScalarsUsedForPrediction !== false || !replay.sourceMatricesConstructedFromConfiguration ||
      replay.sourceMatricesUsedForPrediction !== false || replay.matrixComparisons?.length !== 2)) {
    throw new Error('Configuration initialization or matrix construction not used');
  }
  if (runtime.observationConstructionInputs && (!replay.observationGroupsConstructedFromGeometry ||
      replay.sourceObservationGroupsUsedForPrediction !== false || replay.observationComparisons?.length !== 6)) {
    throw new Error('Independent observation construction not used');
  }
  if (runtime.receiverConstructionInputs && (!replay.receiverGeometryComputed || replay.finalReceiverCoordinatesUsedForPrediction !== false ||
      replay.receiverComparisons?.length !== runtime.observationConstructionInputs.geometry.length)) {
    throw new Error('Receiver geometry construction not used');
  }
  groupReports.push({group, passed: replay.passed, sameRunCapturedSourceBound: replay.sameRunCapturedSourceBound,
    steps: replay.steps, sourceHashes: replay.sourceHashes, initializationComputed: replay.initializationComputed,
    matrixComparisons: replay.matrixComparisons,
    sourceMatricesConstructedFromConfiguration: replay.sourceMatricesConstructedFromConfiguration,
    sourceMatricesUsedForPrediction: replay.sourceMatricesUsedForPrediction,
    observationComparisons: replay.observationComparisons,
    observationGroupsConstructedFromGeometry: replay.observationGroupsConstructedFromGeometry,
    sourceObservationGroupsUsedForPrediction: replay.sourceObservationGroupsUsedForPrediction,
    receiverGeometryComputed: replay.receiverGeometryComputed,
    finalReceiverCoordinatesUsedForPrediction: replay.finalReceiverCoordinatesUsedForPrediction,
    receiverComparisons: replay.receiverComparisons,
    sourceExcitationUsedForPrediction: replay.sourceExcitationUsedForPrediction,
    sourceGridScalarsUsedForPrediction: replay.sourceGridScalarsUsedForPrediction});
  for (let channel = 0; channel < 3; channel++) {
    const node = group * 3 + channel, target = native.nodeRecord.targets[node];
    const predicted = replay.dispatchComparisons[channel], targetSha256 = readTarget(target);
    comparisons.push({node, group, channel, compared: predicted.compared,
      matches: predicted.compared === target.length && predicted.predictedSha256 === targetSha256,
      predictedSha256: predicted.predictedSha256, targetSha256});
  }
}
const passed = comparisons.every((c) => c.matches);
console.log(JSON.stringify({passed, comparisons, groupReports,
  allNineDispatcherResponsesComputedFromCapturedSourceState: passed,
  allNineInitializedFromConfiguration: groupReports.every((g) => g.initializationComputed),
  capturedGridScalarsOrExcitationUsedForPrediction: groupReports.some((g) =>
    g.sourceExcitationUsedForPrediction || g.sourceGridScalarsUsedForPrediction),
  nodeOracleCapturedInOneProcess: true, sourceGroupsCapturedInSeparateProcesses: true,
  sourceMatricesConstructedFromConfiguration: groupReports.every((g) => g.sourceMatricesConstructedFromConfiguration),
  sourceMatricesUsedForPrediction: groupReports.some((g) => g.sourceMatricesUsedForPrediction),
  observationGroupsConstructedFromGeometry: groupReports.every((g) => g.observationGroupsConstructedFromGeometry),
  sourceObservationGroupsUsedForPrediction: groupReports.some((g) => g.sourceObservationGroupsUsedForPrediction),
  receiverGeometryComputed: groupReports.every((g) => g.receiverGeometryComputed),
  finalReceiverCoordinatesUsedForPrediction: groupReports.some((g) => g.finalReceiverCoordinatesUsedForPrediction),
  primaryReceiverConfigurationStillCaptured: true,
  sourceMatricesConstructedFromModel: false, fullModelToIrGenerationVerified: false,
  completeVoiceVerified: false, finalStereoAudioVerified: false}, null, 2));
if (!passed) process.exitCode = 1;
