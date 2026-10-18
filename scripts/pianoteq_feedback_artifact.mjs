import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
    usesComputedDrive: report.computedDriveSource === true, rows(block) {
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
  return { reportSha256: sha(raw), audioSha256: sha(audio), usesComputedDrive: report.nativeDriveScratchUsedForPrediction === false, row(block) {
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
  return { reportSha256: sha(raw), audioSha256: sha(audio), row(block) {
    if (!Number.isInteger(block) || block < 0 || block >= blocks) throw Error('Bound drive block required');
    return Float32Array.from({ length: 64 }, (_, i) => {
      const value = audio.readFloatLE(block * 256 + i * 4);
      if (!Number.isFinite(value)) throw Error('Finite computed drive required');
      return value;
    });
  } };
}
