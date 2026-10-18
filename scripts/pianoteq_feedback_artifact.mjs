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
  return { reportSha256: sha(raw), audioSha256: sha(audio), rows(block) {
    if (!Number.isInteger(block) || block < 0 || block >= blocks) throw Error('Bound feedback block required');
    return Array.from({ length: 3 }, (_, row) => Float32Array.from({ length: 64 }, (_, i) => {
      const value = audio.readFloatLE(block * 768 + (row * 64 + i) * 4);
      if (!Number.isFinite(value)) throw Error('Finite computed feedback required');
      return value;
    }));
  } };
}
