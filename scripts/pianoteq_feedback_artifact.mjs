import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function readComputedLevels(root, capture, reportPath, audioPath) {
  if (!reportPath || !audioPath || capture.driveLevelSameRun !== true || capture.monoBodySameRun !== true)
    throw Error('Paired same-run key/level proof required');
  const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const source = fs.readFileSync(path.join(root, capture.driveLevelFile));
  const data = JSON.parse(source), raw = fs.readFileSync(reportPath), report = JSON.parse(raw);
  const audio = fs.readFileSync(audioPath), blocks = capture.globalAudioRecords.length;
  if (sha(source) !== capture.driveLevelSha256 || report.inputSha256 !== sha(source) || report.passed !== true ||
      report.mismatches !== 0 || !(report.checks > 0) || report.blocks !== blocks || blocks !== 2320 ||
      report.nativeKeyPositionsUsedForPrediction !== false || report.nativeSensorPairsUsedForPrediction !== false ||
      report.nativeDriveLevelUsedForPrediction !== false || report.initialRawHistoryComputedFromZero !== true ||
      report.initialSensorPairsComputedFromZero !== true || report.initializationCalls !== 1 ||
      !capture.runStatus?.terminal || capture.runStatus.exitStatus !== 0 || !Number.isInteger(capture.runStatus.pid) || capture.runStatus.pid <= 0 ||
      data.runStatus?.pid !== capture.runStatus.pid || !data.runStatus.terminal || data.runStatus.exitStatus !== 0 ||
      data.targetMutation !== false || data.errors.length || data.pending !== false || data.records.length !== blocks ||
      data.warmups.length !== 1 || data.warmups[0].callerSites[0] !== '0x1006b95e8' ||
      audio.length !== blocks * 4 || sha(audio) !== report.computedLevelsSha256)
    throw Error('Complete bound same-run computed levels required');
  if (data.phaseTransitions.length !== blocks * 2 ||
      JSON.stringify(data.phaseTransitions) !== JSON.stringify(capture.driveLevelPhaseTransitions))
    throw Error('Complete registered raw/drive phase chronology required');
  data.records.forEach((item, i) => {
    const first = data.phaseTransitions[2 * i], second = data.phaseTransitions[2 * i + 1];
    if (item.ordinal !== i || item.kind !== 'render' || item.frameEndTarget !== (i + 1) * 64 ||
        first.ordinal !== i || first.from !== '0x100096558' || first.to !== '0x100829d48' ||
        second.ordinal !== i + 1 || second.from !== first.to || second.to !== first.from)
      throw Error('Exact level/block and alternating hook chronology required');
  });
  return { reportSha256: sha(raw), audioSha256: sha(audio), sourceSha256: sha(source), level(block) {
    if (!Number.isInteger(block) || block < 0 || block >= blocks) throw Error('Bound level block required');
    const value = audio.readFloatLE(block * 4);
    if (!Number.isFinite(value)) throw Error('Finite computed level required');
    return value;
  } };
}

// Require the producer's complete same-run proof before using computed feedback.
export function readComputedFeedback(root, capture, reportPath, audioPath) {
  if (!reportPath || !audioPath || !capture.feedbackLatticeSameRun) throw Error('Paired same-run feedback report and audio required');
  const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const raw = fs.readFileSync(reportPath), report = JSON.parse(raw);
  const source = fs.readFileSync(path.join(root, capture.feedbackLatticeFile));
  const observed = JSON.parse(source), audio = fs.readFileSync(audioPath);
  const blocks = capture.globalAudioRecords.length;
  if (sha(source) !== capture.feedbackLatticeSha256 || report.inputSha256 !== sha(source) ||
      !report.feedbackRouteVerified || report.mismatches !== 0 || !report.checks || report.blocks !== blocks ||
      report.nativeOutputOrRingHistoryUsedForPrediction !== false ||
      observed.runStatus?.pid !== capture.runStatus.pid || !observed.runStatus.terminal || observed.runStatus.exitStatus !== 0 ||
      observed.errors.length || observed.pending || observed.observations.length !== blocks ||
      audio.length !== blocks * 768 || sha(audio) !== report.computedFeedbackSha256)
    throw Error('Complete bound independently calculated same-run feedback required');
  observed.observations.forEach((item, i) => { if (item.globalOrdinal !== i) throw Error('Exact feedback/global chronology required'); });
  if (report.nativeMonoSourceUsedForPrediction === false && (!capture.monoBodySameRun ||
      !/^[a-f0-9]{64}$/.test(report.computedMonoReportSha256) || !/^[a-f0-9]{64}$/.test(report.computedMonoAudioSha256)))
    throw Error('Computed mono provenance required');
  return { reportSha256: sha(raw), audioSha256: sha(audio), usesComputedMono: report.nativeMonoSourceUsedForPrediction === false,
    usesComputedDrive: report.computedDriveSource === true, usesComputedLevels: report.computedLevelsSource === true, rows(block) {
    if (!Number.isInteger(block) || block < 0 || block >= blocks) throw Error('Bound feedback block required');
    return Array.from({ length: 3 }, (_, row) => Float32Array.from({ length: 64 }, (_, i) => {
      const value = audio.readFloatLE(block * 768 + (row * 64 + i) * 4);
      if (!Number.isFinite(value)) throw Error('Finite computed feedback required');
      return value;
    }));
  } };
}

export function readComputedMono(root, capture, reportPath, audioPath) {
  if (!reportPath || !audioPath || !capture.monoBodySameRun) throw Error('Paired same-run mono proof required');
  const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const raw = fs.readFileSync(reportPath), report = JSON.parse(raw);
  const source = fs.readFileSync(path.join(root, capture.monoBodyFile));
  const data = JSON.parse(source), audio = fs.readFileSync(audioPath), blocks = capture.globalAudioRecords.length;
  if (sha(source) !== capture.monoBodySha256 || report.inputSha256 !== sha(source) || !report.passed || report.mismatches !== 0 || report.blocks !== blocks ||
      report.nativeBodyOutputUsedForPrediction !== false || report.nativePreLatticeMonoUsedForPrediction !== false ||
      data.runStatus?.pid !== capture.runStatus.pid || !data.runStatus.terminal || data.runStatus.exitStatus !== 0 || data.pending || data.errors.length ||
      data.observations.length !== blocks || audio.length !== blocks * 256 || sha(audio) !== report.computedMonoSha256)
    throw Error('Complete bound computed mono required');
  data.observations.forEach((item, i) => { if (item.ordinal !== i) throw Error('Exact mono chronology required'); });
  if (report.nativeDriveScratchUsedForPrediction === false && (!/^[a-f0-9]{64}$/.test(report.computedDriveReportSha256) || !/^[a-f0-9]{64}$/.test(report.computedDriveAudioSha256)))
    throw Error('Computed drive provenance required');
  return { reportSha256: sha(raw), audioSha256: sha(audio), usesComputedDrive: report.nativeDriveScratchUsedForPrediction === false, usesComputedLevels: report.computedLevelsSource === true, row(block) {
    if (!Number.isInteger(block) || block < 0 || block >= blocks) throw Error('Bound mono block required');
    return Float32Array.from({ length: 64 }, (_, i) => {
      const value = audio.readFloatLE(block * 256 + i * 4);
      if (!Number.isFinite(value)) throw Error('Finite computed mono required');
      return value;
    });
  } };
}

export function readComputedDrive(root, capture, reportPath, audioPath) {
  if (!reportPath || !audioPath || !capture.monoBodySameRun) throw Error('Paired same-run drive proof required');
  const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const raw = fs.readFileSync(reportPath), report = JSON.parse(raw);
  const source = fs.readFileSync(path.join(root, capture.monoBodyFile));
  const data = JSON.parse(source), audio = fs.readFileSync(audioPath), blocks = capture.globalAudioRecords.length;
  if (sha(source) !== capture.monoBodySha256 || report.inputSha256 !== sha(source) || !report.passed || report.mismatches !== 0 || report.blocks !== blocks ||
      report.nativeDriveScratchUsedForPrediction !== false || report.nativeDynamicStateUsedForPrediction !== false || report.inputAfterComputed !== true ||
      data.runStatus?.pid !== capture.runStatus.pid || !data.runStatus.terminal || data.runStatus.exitStatus !== 0 || data.pending || data.errors.length ||
      data.observations.length !== blocks || audio.length !== blocks * 256 || sha(audio) !== report.computedDriveSha256)
    throw Error('Complete bound computed drive required');
  data.observations.forEach((item, i) => { if (item.ordinal !== i) throw Error('Exact drive chronology required'); });
  if (report.sameRunComputedLevels === true && (capture.driveLevelSameRun !== true || report.nativeDriveLevelUsedForPrediction !== false ||
      report.computedLevelsSourceSha256 !== capture.driveLevelSha256 || !/^[a-f0-9]{64}$/.test(report.computedLevelsReportSha256) ||
      !/^[a-f0-9]{64}$/.test(report.computedLevelsAudioSha256))) throw Error('Same-run computed level provenance required');
  return { reportSha256: sha(raw), audioSha256: sha(audio), usesComputedLevels: report.sameRunComputedLevels === true, row(block) {
    if (!Number.isInteger(block) || block < 0 || block >= blocks) throw Error('Bound drive block required');
    return Float32Array.from({ length: 64 }, (_, i) => {
      const value = audio.readFloatLE(block * 256 + i * 4);
      if (!Number.isFinite(value)) throw Error('Finite computed drive required');
      return value;
    });
  } };
}
