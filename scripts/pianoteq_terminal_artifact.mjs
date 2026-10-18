// Fresh calculated terminal samples, with all remaining native inputs explicit.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function closure() {
  const files = {}, visit = name => {
    const absolute = path.resolve(root, name), relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Local source closure required');
    if (files[relative]) return;
    const bytes = fs.readFileSync(absolute); files[relative] = sha(bytes);
    for (const match of bytes.toString().matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))
      visit(path.relative(root, path.resolve(path.dirname(absolute), match[1])));
  };
  visit('scripts/pianoteq_replay_release_continuous_chain.mjs');
  return files;
}
function boundFile(filename) { return {path: path.resolve(filename), sha256: sha(fs.readFileSync(filename))}; }
export function writeTerminalArtifact(directory, report, reportFile, args) {
  if (fs.existsSync(directory) || path.resolve(directory).startsWith(root + path.sep)) throw Error('Fresh private artifact directory required');
  const required = ['archive-source', 'archive-repeat-model', 'pitch-source', 'damping-source', 'duration-source', 'resume-audit'];
  const values = Object.fromEntries(required.map(k => {
    const selected = args.filter(a => a.startsWith('--' + k + '='));
    if (selected.length !== 1) throw Error('Explicit current source contract required: ' + k);
    return [k, selected[0].slice(k.length + 3)];
  }));
  if (args.some(a => a.startsWith('--prepared-source=')) || !report.passed || report.mismatches !== 0 ||
      !report.tailEnvelopes?.passed || report.tailEnvelopes.outputs.length !== 3314 ||
      report.preparedSourceBridge?.historicalPredictionReportRequired !== false ||
      report.preparedSourceBridge.sourceTablesConstructedDuringReplay !== true ||
      !report.computedReleaseModel || !report.computedKeyRelease || !report.computedTerminalSlopes || !report.onsetInitializationComputed)
    throw Error('Complete fresh archive-source calculation required');
  const inputs = [boundFile(args[0]), ...Object.values(values).map(boundFile)];
  const archive = JSON.parse(fs.readFileSync(values['archive-source']));
  for (const k of ['resourcePath', 'presetPath', 'contextPath', 'midiPath']) inputs.push(boundFile(archive[k]));
  const repeat = JSON.parse(fs.readFileSync(values['archive-repeat-model']));
  inputs.push(boundFile(repeat.presetPath));
  if(report.auxiliarySourceProducer){
    if(report.auxiliarySourceProducer.mismatches!==0||report.auxiliarySourceProducer.nativeAuxiliaryAudioUsedForPrediction!==false||report.tailEnvelopes.auxiliaryEntryObserved!==false)throw Error('Passed calculated auxiliary source required');
    for(const item of report.auxiliarySourceProducer.inputFiles){const bound=boundFile(item.path);if(bound.sha256!==item.sha256)throw Error('Auxiliary input changed');inputs.push(bound);}
  }
  if (inputs[0].sha256 !== report.captureSha256) throw Error('Bound source capture required');
  const bytes = Buffer.alloc(3314 * 1536), index = [], ages = new Map();
  for (const [ordinal, item] of report.tailEnvelopes.outputs.entries()) {
    if (!Number.isInteger(item.epoch) || item.epoch < 0 || item.epoch > 4 || item.counter !== (ages.get(item.epoch) ?? 0) ||
        item.channels?.length !== 3 || item.auxiliary?.length !== 3) throw Error('Complete continuous terminal calculation required');
    const offset = ordinal * 1536;
    [...item.channels, ...item.auxiliary].forEach((row, r) => {
      if (row.length !== 64) throw Error('Complete terminal row required');
      row.forEach((v, i) => {
        if (!Number.isFinite(v) || !Object.is(v, Math.fround(v))) throw Error('Finite float32 terminal sample required');
        bytes.writeFloatLE(v, offset + (r * 64 + i) * 4);
      });
    });
    index.push({epoch: item.epoch, counter: item.counter, offset, sha256: sha(bytes.subarray(offset, offset + 1536))});
    ages.set(item.epoch, item.counter + 64);
  }
  if (ages.size !== 5) throw Error('Five complete voices required');
  const manifest = {schema: 'pianoteq-calculated-terminal-v1', report: boundFile(reportFile), inputs,
    arguments: args, sourceClosure: closure(), audioSha256: sha(bytes), audioBytes: bytes.length, index,
    fixture: {midiSha256: archive.midiSha256, presetSha256: archive.presetSha256, resourceSha256: archive.resourceSha256},
    nativeTerminalGroupsUsedForPrediction: false, nativeAuxiliaryEntryStillObserved: !report.auxiliarySourceProducer,
    nativeRuntimeControlsAndSchedulingStillObserved: true, independentMidiToStereo: false};
  fs.mkdirSync(directory, {mode: 0o700});
  fs.writeFileSync(path.join(directory, 'terminal.bin'), bytes, {flag: 'wx', mode: 0o600});
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  return {directory: path.resolve(directory), audioSha256: manifest.audioSha256};
}
export function readTerminalArtifact(directory, fixture) {
  const raw = fs.readFileSync(path.join(directory, 'manifest.json')), m = JSON.parse(raw);
  if (m.schema !== 'pianoteq-calculated-terminal-v1' || m.index?.length !== 3314 ||
      m.nativeTerminalGroupsUsedForPrediction !== false || typeof m.nativeAuxiliaryEntryStillObserved !== 'boolean' ||
      m.nativeRuntimeControlsAndSchedulingStillObserved !== true || m.independentMidiToStereo !== false)
    throw Error('Complete calculated terminal provenance required');
  if (m.fixture.midiSha256 !== fixture.midiSha256 || m.fixture.presetSha256 !== fixture.selection.sha256 ||
      m.fixture.resourceSha256 !== fixture.resourceSha256) throw Error('Identical calculated terminal fixture required');
  const current = closure();
  if (Object.keys(current).length !== Object.keys(m.sourceClosure).length ||
      Object.entries(current).some(([k, digest]) => m.sourceClosure[k] !== digest)) throw Error('Current terminal producer closure required');
  for (const f of [...m.inputs, m.report]) if (sha(fs.readFileSync(f.path)) !== f.sha256) throw Error('Terminal producer input or report changed');
  const report = JSON.parse(fs.readFileSync(m.report.path));
  if (!report.passed || report.mismatches !== 0 || !report.tailEnvelopes?.passed ||
      report.captureSha256 !== m.inputs[0].sha256 || report.preparedSourceBridge?.historicalPredictionReportRequired !== false)
    throw Error('Passed archive-source producer required');
  if(m.nativeAuxiliaryEntryStillObserved!==!report.auxiliarySourceProducer||report.tailEnvelopes.auxiliaryEntryObserved!==m.nativeAuxiliaryEntryStillObserved)throw Error('Explicit auxiliary prediction boundary required');
  const bytes = fs.readFileSync(path.join(directory, 'terminal.bin'));
  if (bytes.length !== 3314 * 1536 || bytes.length !== m.audioBytes || sha(bytes) !== m.audioSha256)
    throw Error('Bound complete calculated terminal audio required');
  const voices = new Map(), ages = new Map();
  m.index.forEach((item, ordinal) => {
    const key = item.epoch + ':' + item.counter;
    if (!Number.isInteger(item.epoch) || item.epoch < 0 || item.epoch > 4 || voices.has(key) ||
        item.counter !== (ages.get(item.epoch) ?? 0) || item.offset !== ordinal * 1536 ||
        sha(bytes.subarray(item.offset, item.offset + 1536)) !== item.sha256) throw Error('Complete calculated terminal intervals required');
    const rows = Array.from({length: 6}, (_, r) => Float32Array.from({length: 64}, (_, i) => {
      const v = bytes.readFloatLE(item.offset + (r * 64 + i) * 4);
      if (!Number.isFinite(v)) throw Error('Finite calculated terminal sample required'); return v;
    }));
    voices.set(key, rows); ages.set(item.epoch, item.counter + 64);
  });
  if (ages.size !== 5) throw Error('Five calculated terminal voices required');
  return {voices, nativeAuxiliaryEntryStillObserved:m.nativeAuxiliaryEntryStillObserved,manifestSha256: sha(raw), audioSha256: m.audioSha256, directory: path.resolve(directory)};
}
