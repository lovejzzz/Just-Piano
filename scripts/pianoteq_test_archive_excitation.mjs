// Replay authentic source targets while access to their input values is denied.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {bindArchiveExcitation} from './pianoteq_bind_archive_excitation.mjs';
const [sourceFile, captureFile, reportFile, output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw new Error('Usage: archive-source capture passed-continuous-report fresh-audit');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sourceBytes = fs.readFileSync(sourceFile), captureBytes = fs.readFileSync(captureFile), reportBytes = fs.readFileSync(reportFile);
const capture = JSON.parse(captureBytes), report = JSON.parse(reportBytes), provenance = report.preparedSourceBridge;
if (report.passed !== true || report.captureSha256 !== sha(captureBytes) || provenance?.archiveSourceSha256 !== sha(sourceBytes) ||
    provenance?.sourceTablesConstructedDuringReplay !== true || !capture.complete || capture.errors.length)
  throw new Error('Passed bound continuous archive-source replay required');
const decoded = JSON.parse(sourceBytes), allowed = new Set([decoded.resourcePath, decoded.presetPath, decoded.contextPath, decoded.midiPath]);
const read = fs.readFileSync; let originalObservationFileReads = 0, own;
try {
  fs.readFileSync = function(file, ...args) {
    if (!allowed.has(String(file))) { originalObservationFileReads++; throw new Error('Unexpected runtime file: ' + file); }
    return read.call(this, file, ...args);
  };
  own = bindArchiveExcitation(sourceBytes, sha(captureBytes));
} finally { fs.readFileSync = read; }
const floats = new DataView(new ArrayBuffer(4));
const bits = v => { if (!Number.isFinite(v)) throw new Error('Finite target required'); floats.setFloat32(0, v); return floats.getUint32(0); };
let sourceValues = 0, velocityValues = 0, randomWords = 0, hardnessValues = 0, deniedAccesses = 0;
function deny(object, key) { Object.defineProperty(object, key, {get() { deniedAccesses++; throw new Error('Forbidden captured input: ' + key); }}); }
for (const r of capture.records) {
  if (r.stage === 'before') {
    const minimal = {stage: r.stage, epoch: r.epoch, note: r.note}; deny(minimal, 'inputs');
    assert.equal(bits(own.beginVelocity(minimal)), bits(r.inputs.newVelocity)); velocityValues++;
  } else if (r.stage === 'weights') {
    const input = {...r.input, controls: {...r.input.controls}}, record = {...r, input};
    for (const key of ['source', 'curves']) deny(input, key);
    for (const key of ['velocity', 'attenuation']) deny(input.controls, key);
    deny(record, 'randomState');
    const trace = provenance.runtimeAudit.traces.find(t => t.epoch === r.epoch && t.mode === r.input.mode);
    if (!trace) throw new Error('Own same-replay repeated-strike trace required');
    const source = own.consume(record, {repeat: {attenuation: trace.attenuation}});
    for (const name of ['frequency', 'decay', 'amplitude', 'phase']) {
      assert.equal(source[name].length, r.input.source[name].length);
      source[name].forEach((v, i) => {assert.equal(bits(v), bits(r.input.source[name][i])); sourceValues++;});
    }
    if (r.input.mode === 0) own.primaryRandomState(record).forEach((v, i) => {assert.equal(v, r.randomState[i]); randomWords++;});
    const curves = own.hardnessCurves(record);
    for (const family of ['primary', 'secondary']) for (const key of ['knots', 'values'])
      curves[family][key].forEach((v, i) => {assert.equal(bits(v), bits(r.input.curves[family][key][i])); hardnessValues++;});
    assert.throws(() => own.consume(record, {repeat: {attenuation: trace.attenuation}}), /matching source mode/);
  }
}
assert.equal(own.verifyComplete(), 10);
assert.equal(deniedAccesses, 0);
assert.equal(originalObservationFileReads, 0);
assert.equal(sourceValues, 2160); assert.equal(velocityValues, 5); assert.equal(randomWords, 20); assert.equal(hardnessValues, 200);
assert.throws(() => own.beginVelocity({stage: 'before', epoch: 0, note: 69}), /Chronological/);
const result = {passed: true, sourceValues, velocityValues, randomWords, hardnessValues, deniedAccesses, originalObservationFileReads,
  duplicateModeRejections: 10, duplicateStartRejected: true,
  nativeSourceArraysUsedAsInput: false, nativeVelocityAttenuationHardnessAndRandomStateUsedAsInput: false,
  repeatAttenuationFromBoundOwnContinuousReport: true, blendAndRuntimeControlsStillExplicit: true,
  sourceSha256: sha(sourceBytes), captureSha256: sha(captureBytes), reportSha256: sha(reportBytes),
  audioSamplesComparedHere: 0, finalStereoAudioVerified: false};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify(result));
