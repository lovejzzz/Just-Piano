// Numerical validation of voice-consumer delay and level multiplication.
// Inputs outside the verified upstream window remain observed modal buffers.
import fs from 'node:fs';
import { renderVoiceDelay, scaleVoiceGroups } from '../dsp/voice-output-delay.mjs';
const [capturePath, reportPath, option, sourcePath, ...extra] = process.argv.slice(2);
if (!capturePath || !reportPath || option !== '--source-report' || !sourcePath || extra.length) {
  throw new Error('Usage: capture.json report.json --source-report post-modal-report.json');
}
const data = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (data.schema !== 1 || !data.windowComplete || data.errors.length || !source.passed ||
    source.mismatches || !source.predictions?.length || !source.rawModalBlocksComputed) {
  throw new Error('Complete capture and verified computed upstream buffers required');
}
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
const fromBits = x => { view.setUint32(0, x); return view.getFloat32(0); };
const checks = [], failures = [], predictions = [];
function check(name, predicted, actual) {
  if (predicted.length !== actual.length) throw new Error(`Incomplete ${name}`);
  let bad = 0;
  for (let i = 0; i < predicted.length; i++) {
    if (!Number.isFinite(predicted[i]) || !Number.isFinite(actual[i])) throw new Error(`Nonfinite ${name}`);
    if (bits(predicted[i]) !== bits(actual[i])) {
      bad++;
      if (failures.length < 40) failures.push({ name, index: i, predicted: predicted[i], actual: actual[i] });
    }
  }
  checks.push({ name, count: predicted.length, mismatches: bad });
}
const mode = data.records[1]?.stage === 'redistributed' ? 'delay' : 'gain';
const stages = mode === 'delay' ? ['queued', 'redistributed', 'delayed', 'enveloped'] : ['queued', 'cross', 'gain', 'final'];
if (data.records.length !== data.ordinalLimit * stages.length ||
    new Set(data.records.map(x => x.H)).size !== 1) throw new Error('Incomplete or ambiguous voice capture');
const calculated = new Map();
for (const r of source.predictions) {
  // Native 4e285c increments V+10 before the post-modal observation.
  // Each consumer ordinal is one 64-sample matrix, beginning with source age 0.
  if (r.sourceAge % 64 || calculated.has(r.sourceAge / 64)) throw new Error('Invalid upstream chronology');
  calculated.set(r.sourceAge / 64, r.channels);
}
let states, sourceBlocks = 0, changedDelayedSamples = 0, primaryExtraSamples = 0;
for (let ordinal = 0; ordinal < data.ordinalLimit; ordinal++) {
  const block = data.records.slice(ordinal * 4, ordinal * 4 + 4);
  for (let i = 0; i < 4; i++) {
    if (block[i].stage !== stages[i] || block[i].ordinal !== ordinal || block[i].groups.length !== 3 ||
        block[i].groups.some(g => g.rows !== 1 || g.samples !== 64 || g.values.length !== 64)) {
      throw new Error('Missing, reordered, or malformed consumer stage');
    }
  }
  let input = block[0].groups.map(g => g.values);
  if (calculated.has(ordinal)) {
    input = calculated.get(ordinal);
    for (let g = 0; g < 3; g++) check(`${ordinal}:${g}:computedQueue`, input[g], block[0].groups[g].values);
    sourceBlocks++;
  }
  if (mode === 'delay') {
    if (!states) {
      states = block[1].delays.map(d => ({ length: d.length, elapsed: d.elapsed, writeGain: d.writeGain,
        dryGain: d.dryGain, target: fromBits(d.words[4]), multiplier: fromBits(d.words[5]),
        remaining: d.smoothing, ring: Float32Array.from(d.ring) }));
      if (states.length !== 3 || states.some(s => s.elapsed !== 0)) throw new Error('Initial delay state missing');
    }
    for (let g = 0; g < 3; g++) {
      const before = block[1].delays[g], after = block[2].delays[g], state = states[g];
      check(`${ordinal}:${g}:redistribution`, input[g], block[1].groups[g].values);
      check(`${ordinal}:${g}:beforeGain`, [state.dryGain], [before.dryGain]);
      if (state.elapsed !== before.elapsed || state.remaining !== before.smoothing || state.length !== before.length ||
          state.writeGain !== before.writeGain || state.target !== fromBits(before.words[4]) ||
          state.multiplier !== fromBits(before.words[5])) throw new Error('Delay configuration/state changed');
      const output = renderVoiceDelay(input[g], state);
      check(`${ordinal}:${g}:delay`, output, block[2].groups[g].values);
      check(`${ordinal}:${g}:afterGain`, [state.dryGain], [after.dryGain]);
      if (state.elapsed !== after.elapsed || state.remaining !== after.smoothing) throw new Error('Delay counter mismatch');
      if (after.ring) check(`${ordinal}:${g}:ring`, state.ring, after.ring);
      changedDelayedSamples += output.reduce((n, v, i) => n + (bits(v) !== bits(input[g][i])), 0);
      // Release-dependent primary injection after 460908 is NOT implemented here.
      if (g > 0) check(`${ordinal}:${g}:laterOtherGroup`, output, block[3].groups[g].values);
      else primaryExtraSamples += block[3].groups[g].values.reduce((n, v, i) => n + (bits(v) !== bits(output[i])), 0);
      predictions.push({ ordinal, group: g, output: [...output], gain: state.dryGain });
    }
  } else {
    // Independent terminal-gain validation; the primary release injection is an input gap.
    const c = block[1].controls;
    const output = scaleVoiceGroups(block[1].groups.map(g => g.values), c['0x9c'], c['0xa0']);
    for (let g = 0; g < 3; g++) {
      check(`${ordinal}:${g}:gain`, output[g], block[2].groups[g].values);
      check(`${ordinal}:${g}:laterBypass`, output[g], block[3].groups[g].values);
    }
  }
}
if (sourceBlocks !== source.predictions.length) throw new Error('Incomplete computed-source coverage');
const count = checks.reduce((n, c) => n + c.count, 0);
const mismatches = checks.reduce((n, c) => n + c.mismatches, 0);
const report = { passed: mismatches === 0, mode, count, matched: count - mismatches, mismatches,
  blocks: data.ordinalLimit, windowComplete: true, computedQueueBlocks: sourceBlocks,
  upstreamFromSeparateVerifiedRun: true, delayStateSeededOnce: mode === 'delay', changedDelayedSamples,
  primaryExtraSamples, primaryReleaseInjectionImplemented: false, fullConsumerChainVerified: false,
  finalStereoAudioVerified: false, predictions, checks, failures };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, predictions: undefined, checks: undefined, failures: undefined }));
if (!report.passed) process.exitCode = 1;
