import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DRIVE_STATIC_OFFSETS } from '../dsp/global-drive-core.mjs';

const [directory, reportFile, destination] = process.argv.slice(2);
if (!directory || !reportFile || !destination || fs.existsSync(destination)) throw Error('Usage: accepted-drive-run passing-report fresh-private-profile');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const root = path.resolve(directory), raw = fs.readFileSync(path.join(root, 'runtime.json')), data = JSON.parse(raw);
const reportBytes = fs.readFileSync(reportFile), report = JSON.parse(reportBytes), launch = JSON.parse(fs.readFileSync(path.join(root, 'launch.json')));
if (!data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.errors.length || data.pending || data.targetMutation !== false ||
    !report.passed || report.mismatches || !report.optionalFilterBypassVerified || report.blocks !== data.records.length || report.inputSha256 !== sha(raw) || Object.keys(data.configs).length !== 1)
  throw Error('Passing complete nonlinear drive proof required');
for (const [name, hash] of Object.entries(launch.helperSha256)) if (sha(fs.readFileSync(path.join(root, '..', name))) !== hash) throw Error('Collector closure changed');
for (const [file, hash] of [[launch.fixture.selection.path, launch.fixture.selection.sha256], [launch.fixture.resourcePath, launch.fixture.resourceSha256]]) if (sha(fs.readFileSync(file)) !== hash) throw Error('Static source fixture changed');
const cfg = Object.values(data.configs)[0], bytes = Buffer.alloc(cfg.window.length * 4);
cfg.window.forEach((x, i) => bytes.writeFloatLE(x, i * 4));
if (sha(bytes) !== cfg.windowSha256) throw Error('Complete static wave source required');
const profile = { schema: 1, kind: 'captured-static-drive-profile',
  words: DRIVE_STATIC_OFFSETS.map(offset => [offset, cfg.stateWords[offset / 4]]), window: cfg.window, windowSha256: cfg.windowSha256,
  source: { presetSha256: launch.fixture.selection.sha256, resourceSha256: launch.fixture.resourceSha256,
    captureRuntimeSha256: sha(raw), verificationReportSha256: sha(reportBytes), nativeDynamicSnapshotsExported: false,
    nativeProfileCaptured: true, profileGeneratedFromArchive: false } };
fs.writeFileSync(destination, JSON.stringify(profile), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ scalarWords: profile.words.length, windowLength: profile.window.length, profileSha256: sha(fs.readFileSync(destination)), source: profile.source }));
