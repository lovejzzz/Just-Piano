// Diagnostic comparison only: never supplies a prediction or native fallback.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [reportFile, captureRoot, output, ...flags] = process.argv.slice(2);
if (!output || flags.length > 1 || flags.some(x => x !== '--poison-target'))
  throw Error('Usage: fresh-continuous-report complete-paired-capture fresh-private-audit [--poison-target]');
if (fs.existsSync(output) || path.resolve(output).startsWith(path.resolve('.') + path.sep))
  throw Error('Fresh private audit required');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const reportBytes = fs.readFileSync(reportFile), report = JSON.parse(reportBytes);
const runtimeBytes = fs.readFileSync(path.join(captureRoot, 'runtime.json'));
const runtime = JSON.parse(runtimeBytes);
const tail = report.tailEnvelopes;
if (!report.passed || report.mismatches !== 0 || !tail?.passed || tail.mismatches !== 0 ||
    tail.blocks !== 3314 || tail.outputs?.length !== 3314 ||
    !report.preparedSourceBridge?.sourceTablesConstructedDuringReplay ||
    report.preparedSourceBridge.historicalPredictionReportRequired !== false)
  throw Error('Passed complete freshly computed archive-source report required');
if (!runtime.runStatus?.terminal || runtime.runStatus.exitStatus !== 0 ||
    runtime.targetMutation !== false || runtime.errors?.length !== 0 || runtime.pending !== null ||
    runtime.alternatingSites !== true || runtime.inputs?.length !== 3314 ||
    runtime.outputs?.length !== 3314 || runtime.phaseTransitions?.length !== 6628)
  throw Error('Complete successful read-only paired capture required');
const audio = fs.readFileSync(path.join(captureRoot, runtime.sourceFile));
if (audio.length !== 3314 * 1536 || audio.length !== runtime.sourceBytes ||
    sha(audio) !== runtime.sourceSha256) throw Error('Bound complete terminal target required');
const own = new Map(), ages = new Map();
for (const row of tail.outputs) {
  const key = `${row.epoch}:${row.counter}`;
  if (own.has(key) || !Number.isInteger(row.epoch) || row.epoch < 0 || row.epoch > 4 ||
      row.counter !== (ages.get(row.epoch) ?? 0)) throw Error('Unique continuous computed voice intervals required');
  own.set(key, row); ages.set(row.epoch, row.counter + 64);
}
if (ages.size !== 5) throw Error('Five computed voices required');
const rows = Array.from({length: 6}, (_, i) => ({kind: i < 3 ? 'group' : 'auxiliary',
  row: i % 3, samples: 0, mismatches: 0, firstMismatch: null}));
const packed = Buffer.alloc(audio.length), visited = new Set();
let poisoned = false;
for (const [ordinal, target] of runtime.inputs.entries()) {
  const key = `${target.epoch}:${target.counter}`, value = own.get(key);
  const offset = ordinal * 1536;
  if (!value || visited.has(key) || target.ordinal !== ordinal || target.offset !== offset ||
      target.bytes !== 1536 || sha(audio.subarray(offset, offset + 1536)) !== target.sha256)
    throw Error('Bound unique paired terminal interval required');
  visited.add(key);
  if (value.channels?.length !== 3 || value.auxiliary?.length !== 3)
    throw Error('Six complete calculated terminal rows required');
  [...value.channels, ...value.auxiliary].forEach((values, row) => {
    if (values.length !== 64) throw Error('Complete 64-sample row required');
    values.forEach((v, sample) => {
      if (!Number.isFinite(v) || !Object.is(v, Math.fround(v))) throw Error('Finite float32 prediction required');
      const at = offset + (row * 64 + sample) * 4;
      packed.writeFloatLE(v, at);
      let actual = audio.readUInt32LE(at);
      if (flags.includes('--poison-target') && !poisoned && v !== 0) {
        actual = (actual ^ 1) >>> 0; poisoned = true;
      }
      const stats = rows[row]; stats.samples++;
      if (packed.readUInt32LE(at) !== actual) {
        stats.mismatches++;
        stats.firstMismatch ??= {epoch: target.epoch, counter: target.counter, sample};
      }
    });
  });
}
if (visited.size !== own.size || flags.length && !poisoned) throw Error('Complete exercised comparison required');
const mismatches = rows.reduce((n, r) => n + r.mismatches, 0);
const audit = {schema: 1, diagnosticOnly: true, usedForPrediction: false,
  reportSha256: sha(reportBytes), captureRuntimeSha256: sha(runtimeBytes),
  nativeTerminalSha256: sha(audio), computedTerminalSha256: sha(packed),
  blocks: visited.size, samples: rows.reduce((n, r) => n + r.samples, 0), rows,
  mismatches, passed: mismatches === 0, poisonTarget: poisoned,
  sourceCaptureSha256: report.captureSha256,
  nativeAuxiliaryEntryStillObserved: tail.auxiliaryEntryObserved,
  nativeEnableControlsStillObserved: tail.enableControlsObserved,
  nativeTimeInitializationStillObserved: tail.initialTimeStateObserved,
  nativeTerminalScaleStillObserved: tail.terminalScaleObserved,
  nativeOldVoiceSelectionStillObserved: report.preparedSourceBridge.oldVoiceSelectionStillObserved,
  completeMechanicalCouplingVerified: false, independentStereoVerified: false};
fs.writeFileSync(output, JSON.stringify(audit, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify(audit));
if (mismatches) process.exitCode = 1;
