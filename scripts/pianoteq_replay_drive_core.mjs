import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { GlobalDriveCore64 } from '../dsp/global-drive-core.mjs';

const [input, destination, ...flags] = process.argv.slice(2);
const outputs = flags.filter(x => x.startsWith('--output-drive='));
const levelPrefixes = ['--levels-run=', '--levels-report=', '--levels-audio='];
const levelOptions = levelPrefixes.map(p => flags.filter(x => x.startsWith(p)));
if (!input || !destination || outputs.length > 1 || levelOptions.some(x => x.length > 1) || new Set(levelOptions.map(x => x.length)).size !== 1 || flags.some(x => !['--output-drive=', ...levelPrefixes].some(p => x.startsWith(p)) && x !== '--poison-core-target')) throw Error('Usage: capture fresh-report [--output-drive=NEW_FILE] [--levels-run=RUN --levels-report=REPORT --levels-audio=AUDIO] [--poison-core-target]');
const outputPath = outputs[0]?.slice('--output-drive='.length);
for (const f of [destination, outputPath].filter(Boolean)) if (fs.existsSync(f)) throw Error('Fresh drive outputs required');
const raw = fs.readFileSync(input), data = JSON.parse(raw);
if (!data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.errors.length || data.pending || data.targetMutation !== false || data.records.length !== 2320 || Object.keys(data.configs).length !== 1) throw Error('Complete primary drive observation required');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
let ownLevels = null, levelSource = null;
if (levelOptions[0].length) {
  const [directory, reportFile, audioFile] = levelOptions.map((values, i) => values[0].slice(levelPrefixes[i].length));
  const root = path.resolve(directory), sourceBytes = fs.readFileSync(path.join(root, 'runtime.json')), source = JSON.parse(sourceBytes);
  const reportBytes = fs.readFileSync(reportFile), report = JSON.parse(reportBytes), audio = fs.readFileSync(audioFile);
  const sourceLaunch = JSON.parse(fs.readFileSync(path.join(root, 'launch.json'))), targetLaunch = JSON.parse(fs.readFileSync(path.join(path.dirname(path.resolve(input)), 'launch.json')));
  if (!source.runStatus?.terminal || source.runStatus.exitStatus !== 0 || source.errors.length || source.pending || source.records.length !== data.records.length ||
      !report.passed || report.mismatches !== 0 || report.blocks !== data.records.length || report.inputSha256 !== sha(sourceBytes) || report.nativeDriveLevelUsedForPrediction !== false ||
      report.initialSensorPairsComputedFromZero !== true || report.initialRawHistoryComputedFromZero !== true || audio.length !== data.records.length * 4 || sha(audio) !== report.computedLevelsSha256)
    throw Error('Complete bound computed level source required');
  for (const field of ['midiSha256', 'resourceSha256', 'sampleRate']) if (sourceLaunch.fixture[field] !== targetLaunch.fixture[field]) throw Error('Same MIDI/model render fixture required');
  if (sourceLaunch.fixture.selection.sha256 !== targetLaunch.fixture.selection.sha256) throw Error('Same source preset required');
  for (const [name, hash] of Object.entries(sourceLaunch.helperSha256)) if (sha(fs.readFileSync(path.join(root, '..', name))) !== hash) throw Error('Level collector closure changed');
  ownLevels = Float32Array.from({ length: data.records.length }, (_, i) => { const value = audio.readFloatLE(i * 4); if (!Number.isFinite(value)) throw Error('Finite computed levels required'); return value; });
  levelSource = { sourceCaptureSha256: sha(sourceBytes), sourceReportSha256: sha(reportBytes), sourceLevelsSha256: sha(audio),
    sameNativeProcess: source.runStatus.pid === data.runStatus.pid, rawNodeVelocitiesFlagsAndListsStillObserved: true, staticWeightsStillObserved: true };
}
const [identity, cfg] = Object.entries(data.configs)[0];
const table = Buffer.alloc(cfg.window.length * 4); cfg.window.forEach((x, i) => table.writeFloatLE(x, i * 4));
if (sha(table) !== cfg.windowSha256) throw Error('Complete static drive source required');
const model = new GlobalDriveCore64(cfg), parts = [], modifiedParts = [], failures = [];
let checks = 0, mismatches = 0, nonzero = 0, poisoned = false;
const view = new DataView(new ArrayBuffer(4));
const bits = x => { if (!Number.isFinite(x)) throw Error('Finite drive value required'); view.setFloat32(0, x, true); return view.getUint32(0, true); };
function check(a, b, label) { checks++; if (!Object.is(a, b)) { mismatches++; if (failures.length < 16) failures.push({ label, computed: a, target: b }); } }
function state(target, label) { if (target.length !== 68) throw Error('Complete drive state required'); model.words.forEach((x, i) => check(x, target[i], label + '.' + i)); }
function control(target, label) {
  for (const key of ['previousLevel', 'peak', 'direction']) check(bits(model[key]), bits(target[key]), label + '.' + key);
  check(model.cursor, target.cursor, label + '.cursor'); check(Number(model.reset), target.reset, label + '.reset');
}
function row(value) { if (value.length !== 1 || value[0].length !== 64) throw Error('Complete drive row required'); return value[0]; }
for (const [block, item] of data.records.entries()) {
  if (item.ordinal !== block || item.identity !== identity) throw Error('Bound drive chronology required');
  state(item.stateBefore, `${block}.before`); control(item.before, `${block}.before`);
  const level = ownLevels ? ownLevels[block] : item.before.level;
  if (ownLevels) check(bits(level), bits(item.before.level), `${block}.levelTarget`);
  const result = model.process64(level, item.gain), actualCore = row(item.coreOutput);
  result.output.forEach((x, i) => {
    let target = bits(actualCore[i]);
    if (flags.includes('--poison-core-target') && !poisoned && x !== 0) { target ^= 1; poisoned = true; }
    check(bits(x), target >>> 0, `${block}.core.${i}`); if (x !== 0) nonzero++;
  });
  state(item.coreStateAfter, `${block}.coreAfter`); control(item.coreControlsAfter, `${block}.coreAfter`);
  if (item.filterRequestedGain !== 0 || item.filterBefore.gain !== 0 || item.filterBefore.active !== 0 || item.filterAfter.gain !== 0 || item.filterAfter.active !== 0)
    throw Error('Only the observed zero-gain/inactive optional filter is verified');
  const scratch = row(item.scratchOutput), before = row(item.inputBefore), after = row(item.inputAfter);
  const modified = Float32Array.from(before, (x, i) => Math.fround(x + result.output[i]));
  result.output.forEach((x, i) => { check(bits(x), bits(scratch[i]), `${block}.scratch.${i}`); check(bits(modified[i]), bits(after[i]), `${block}.inputAfter.${i}`); });
  state(item.stateAfter, `${block}.after`); control(item.after, `${block}.after`);
  parts.push(Buffer.from(result.output.buffer)); modifiedParts.push(Buffer.from(modified.buffer));
}
const computed = Buffer.concat(parts), passed = mismatches === 0 && nonzero > 0;
const report = { schema: 1, passed, inputSha256: sha(raw), blocks: data.records.length, checks, mismatches, failures, nonzero, poisoned,
  historyResets: model.historyResets, powCalls: model.powCalls, computedDriveSha256: sha(computed), computedModifiedInputSha256: sha(Buffer.concat(modifiedParts)),
  nativeCoreOutputUsedForPrediction: false, nativeDriveScratchUsedForPrediction: false, nativeDynamicStateUsedForPrediction: false,
  optionalFilterBypassVerified: true, inputAfterComputed: true, nativeLevelAndGainStillObserved: !ownLevels,
  nativeDriveLevelUsedForPrediction: !ownLevels, nativeGainUsedForPrediction: true, levelSource,
  crossRunComponentComparison: !!levelSource && !levelSource.sameNativeProcess,
  staticProfileAndWindowStillObserved: true, independentEngineStereoVerified: false };
fs.writeFileSync(destination, JSON.stringify(report, null, 2), { flag: 'wx' });
if (outputPath) { if (!passed) throw Error('Only passing drive may export'); fs.writeFileSync(outputPath, computed, { flag: 'wx' }); }
console.log(JSON.stringify(report));
if (!passed || flags.includes('--poison-core-target') && !poisoned) process.exitCode = 1;
