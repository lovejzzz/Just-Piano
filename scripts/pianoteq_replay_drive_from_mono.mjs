import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { GlobalDriveCore64, DRIVE_STATIC_OFFSETS, DRIVE_DYNAMIC_OFFSETS } from '../dsp/global-drive-core.mjs';

import { readComputedLevels } from './pianoteq_feedback_artifact.mjs';

const [input, profileFile, destination, ...flags] = process.argv.slice(2);
const out = flags.filter(x => x.startsWith('--output-drive='));
const levelReports = flags.filter(x => x.startsWith('--levels-report=')), levelAudio = flags.filter(x => x.startsWith('--levels-audio='));
if (levelReports.length > 1 || levelAudio.length > 1 || levelReports.length !== levelAudio.length) throw Error('Paired computed levels required');
if (!input || !profileFile || !destination || out.length > 1 || flags.some(x => !['--output-drive=', '--levels-report=', '--levels-audio='].some(p => x.startsWith(p)) && !['--poison-scratch-target', '--poison-level-target'].includes(x))) throw Error('Usage: full-mono-sidecar static-profile fresh-report [--output-drive=NEW_FILE] [--levels-report=REPORT --levels-audio=AUDIO] [--poison-scratch-target|--poison-level-target]');
const outputPath = out[0]?.slice('--output-drive='.length);
for (const file of [destination, outputPath].filter(Boolean)) if (fs.existsSync(file)) throw Error('Fresh drive artifacts required');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const raw = fs.readFileSync(input), data = JSON.parse(raw), profileBytes = fs.readFileSync(profileFile), profile = JSON.parse(profileBytes);
const launch = JSON.parse(fs.readFileSync(path.join(path.dirname(path.resolve(input)), 'launch.json')));
if (!data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.errors.length || data.pending || data.targetMutation !== false || data.observations.length !== 2320 ||
    profile.schema !== 1 || profile.kind !== 'captured-static-drive-profile' || profile.source.nativeDynamicSnapshotsExported !== false ||
    profile.source.presetSha256 !== launch.fixture.selection.sha256 || profile.source.resourceSha256 !== launch.fixture.resourceSha256 ||
    JSON.stringify(profile.words.map(x => x[0])) !== JSON.stringify(DRIVE_STATIC_OFFSETS)) throw Error('Bound complete primary drive inputs required');
const root = path.dirname(path.resolve(input));
const capture = levelReports.length ? JSON.parse(fs.readFileSync(path.join(root, 'runtime.json'))) : null;
const ownLevels = capture ? readComputedLevels(root, capture, levelReports[0].slice('--levels-report='.length), levelAudio[0].slice('--levels-audio='.length)) : null;
if (capture && (capture.monoBodyFile !== path.basename(input) || capture.monoBodySha256 !== sha(raw) || data.runStatus.pid !== capture.runStatus.pid)) throw Error('Levels and drive must share exact mono capture');
if (flags.includes('--poison-level-target') && !ownLevels) throw Error('Level target control requires computed levels');
const staticWords = new Uint32Array(68); profile.words.forEach(([offset, value]) => { staticWords[offset / 4] = value; });
const buffer = Buffer.alloc(profile.window.length * 4); profile.window.forEach((x, i) => buffer.writeFloatLE(x, i * 4));
if (sha(buffer) !== profile.windowSha256) throw Error('Bound static drive waveform required');
const model = new GlobalDriveCore64({ stateWords: [...staticWords], window: profile.window,
  initial: { previousLevel: -1, peak: 0, cursor: 0, reset: 1, direction: 0 } });
const scratchParts = [], modifiedParts = [], failures = [];
let checks = 0, mismatches = 0, nonzero = 0, poisoned = false, levelPoisoned = false;
const word = new DataView(new ArrayBuffer(4));
const bits = x => { if (!Number.isFinite(x)) throw Error('Finite drive value required'); word.setFloat32(0, x, true); return word.getUint32(0, true); };
const float = x => { word.setUint32(0, x, true); return word.getFloat32(0, true); };
function check(a, b, label) { checks++; if (!Object.is(a, b)) { mismatches++; if (failures.length < 12) failures.push({ label, computed: a, target: b }); } }
function row(value) { if (value.length !== 1 || value[0].length !== 64) throw Error('Complete mono drive row required'); return value[0]; }
for (const [block, item] of data.observations.entries()) {
  if (item.ordinal !== block || item.queueBefore.enabled !== 0 || item.queueReturn.enabled !== 0 || item.driveControlWords.length !== 6 || item.driveStateWords.length !== 68) throw Error('Inspected queue-inactive drive branch required');
  const controls = item.driveControlWords;
  for (const offset of [...DRIVE_STATIC_OFFSETS, ...DRIVE_DYNAMIC_OFFSETS]) check(model.words[offset / 4], item.driveStateWords[offset / 4], `${block}.state.${offset}`);
  check(bits(model.previousLevel), controls[0], `${block}.previousLevel`); check(bits(model.peak), controls[2], `${block}.peak`);
  check(Number(model.reset), controls[3] & 255, `${block}.reset`); check(model.cursor, controls[4], `${block}.cursor`);
  const level = ownLevels ? ownLevels.level(block) : float(controls[1]);
  if (ownLevels) {
    let target = controls[1];
    if (flags.includes('--poison-level-target') && !levelPoisoned && level !== 0) { target = (target ^ 1) >>> 0; levelPoisoned = true; }
    check(bits(level), target, `${block}.level`);
  }
  const result = model.process64(level, item.driveGain);
  if (item.driveGain !== 0) throw Error('Observed inactive optional filter requires zero gain');
  const target = row(item.driveScratch), before = row(item.driveInputBefore), after = row(item.bodyInputs[0]);
  const modified = Float32Array.from(before, (x, i) => Math.fround(x + result.output[i]));
  result.output.forEach((x, i) => {
    let actual = bits(target[i]);
    if (flags.includes('--poison-scratch-target') && !poisoned && x !== 0) { actual ^= 1; poisoned = true; }
    check(bits(x), actual >>> 0, `${block}.scratch.${i}`); check(bits(modified[i]), bits(after[i]), `${block}.modifiedInput.${i}`);
    if (x !== 0) nonzero++;
  });
  scratchParts.push(Buffer.from(result.output.buffer)); modifiedParts.push(Buffer.from(modified.buffer));
}
const drive = Buffer.concat(scratchParts), passed = mismatches === 0 && nonzero > 0;
const report = { schema: 1, passed, inputSha256: sha(raw), staticProfileSha256: sha(profileBytes), profileSource: profile.source,
  blocks: data.observations.length, checks, mismatches, failures, nonzero, poisoned, historyResets: model.historyResets, powCalls: model.powCalls,
  computedDriveSha256: sha(drive), computedModifiedInputSha256: sha(Buffer.concat(modifiedParts)),
  nativeCoreOutputUsedForPrediction: false, nativeDriveScratchUsedForPrediction: false, nativeDynamicStateUsedForPrediction: false,
  inputAfterComputed: true, optionalFilterBranchFromBoundProfile: true, nativeLevelAndGainStillObserved: !ownLevels, nativeDriveLevelUsedForPrediction: !ownLevels, nativeDriveGainStillObserved: true,
  computedLevelsReportSha256: ownLevels?.reportSha256 ?? null, computedLevelsAudioSha256: ownLevels?.audioSha256 ?? null,
  computedLevelsSourceSha256: ownLevels?.sourceSha256 ?? null, sameRunComputedLevels: !!ownLevels, levelPoisoned,
  staticProfileAndWindowStillObserved: true, independentEngineStereoVerified: false };
fs.writeFileSync(destination, JSON.stringify(report, null, 2), { flag: 'wx' });
if (outputPath) { if (!passed) throw Error('Only passing drive may export'); fs.writeFileSync(outputPath, drive, { flag: 'wx' }); }
console.log(JSON.stringify(report));
if (!passed || flags.includes('--poison-scratch-target') && !poisoned || flags.includes('--poison-level-target') && !levelPoisoned) process.exitCode = 1;
