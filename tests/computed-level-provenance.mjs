import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { readComputedLevels } from '../scripts/pianoteq_feedback_artifact.mjs';

// Synthetic contract tests only; these do not establish acoustic equivalence.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'piano-level-proof-'));
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
try {
  const blocks = 2320, status = { pid: 123, terminal: true, exitStatus: 0 };
  const transitions = Array.from({ length: blocks }, (_, i) => [
    { ordinal: i, from: '0x100096558', to: '0x100829d48' },
    { ordinal: i + 1, from: '0x100829d48', to: '0x100096558' },
  ]).flat();
  const source = { runStatus: status, targetMutation: false, errors: [], pending: false,
    records: Array.from({ length: blocks }, (_, i) => ({ ordinal: i, kind: 'render', frameEndTarget: (i + 1) * 64 })),
    warmups: [{ callerSites: ['0x1006b95e8'] }], phaseTransitions: transitions };
  const sourceBytes = Buffer.from(JSON.stringify(source)), audio = Buffer.alloc(blocks * 4);
  audio.writeFloatLE(-0.5, 75 * 4);
  const capture = { driveLevelSameRun: true, monoBodySameRun: true, driveLevelFile: 'levels.json',
    driveLevelSha256: sha(sourceBytes), driveLevelPhaseTransitions: transitions,
    globalAudioRecords: Array(blocks).fill(null), runStatus: status };
  const report = { passed: true, mismatches: 0, checks: 1, blocks, inputSha256: sha(sourceBytes),
    computedLevelsSha256: sha(audio), nativeKeyPositionsUsedForPrediction: false,
    nativeSensorPairsUsedForPrediction: false, nativeDriveLevelUsedForPrediction: false,
    initialRawHistoryComputedFromZero: true, initialSensorPairsComputedFromZero: true, initializationCalls: 1 };
  const reportPath = path.join(root, 'report.json'), audioPath = path.join(root, 'levels.bin');
  const saveReport = value => fs.writeFileSync(reportPath, JSON.stringify(value));
  fs.writeFileSync(path.join(root, 'levels.json'), sourceBytes);
  fs.writeFileSync(audioPath, audio); saveReport(report);
  const read = () => readComputedLevels(root, capture, reportPath, audioPath);
  assert.equal(read().level(75), -0.5);
  assert.throws(() => read().level(blocks));
  const pid = capture.runStatus;
  capture.runStatus = { ...status, pid: 124 }; assert.throws(read); capture.runStatus = pid;
  saveReport({ ...report, passed: false }); assert.throws(read); saveReport(report);
  saveReport({ ...report, nativeDriveLevelUsedForPrediction: true }); assert.throws(read); saveReport(report);
  const damaged = Buffer.from(audio); damaged[75 * 4] ^= 1;
  fs.writeFileSync(audioPath, damaged); assert.throws(read); fs.writeFileSync(audioPath, audio);
  // Rebinding the source hash cannot make a skipped phase or frame acceptable.
  for (const alter of [s => s.phaseTransitions.pop(), s => { s.records[75].frameEndTarget++; }]) {
    const changed = structuredClone(source); alter(changed);
    const bytes = Buffer.from(JSON.stringify(changed));
    fs.writeFileSync(path.join(root, 'levels.json'), bytes);
    capture.driveLevelSha256 = sha(bytes); capture.driveLevelPhaseTransitions = changed.phaseTransitions;
    saveReport({ ...report, inputSha256: sha(bytes) }); assert.throws(read);
  }
  console.log('computed levels: process, proof, binary, phase and frame rejection passed (synthetic contract only)');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
