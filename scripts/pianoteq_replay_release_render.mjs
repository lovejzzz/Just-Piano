// Continuous release-window state, energy/pruning, damping and complete groups.
import fs from 'node:fs';
import { advanceReleasedKey } from '../dsp/release-key-state.mjs';
import { produceReleasePosition, consumeReleasePosition } from '../dsp/release-position-transfer.mjs';
import { releaseCoefficients } from '../dsp/physical-controls.mjs';
import { refreshDampedModes } from '../dsp/damped-modal-refresh.mjs';
import { updateModalEnergyAndPrune } from '../dsp/modal-energy-pruning.mjs';
import { modalAngleGroup, projectModalHistory } from '../dsp/modal-initial.mjs';
import { renderSixteen, renderEight } from '../dsp/modal-kernel.mjs';

const [input, output, ...options] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: runtime.json report.json');
const data = JSON.parse(fs.readFileSync(input, 'utf8'));
if (data.schema !== 1 || data.errors.length || !data.records.length) throw new Error('Invalid capture');
const externalRelease = new Map();
if (options.length) {
  if (options.length !== 2 || options[0] !== '--release-report' || data.mode !== 'worker') {
    throw new Error('Only worker mode accepts --release-report');
  }
  const source = JSON.parse(fs.readFileSync(options[1], 'utf8'));
  if (!source.passed || !source.sameRunAssociation || !source.nodeAndVoiceStateCarried ||
      !source.coefficientBridgeInSameRun) throw new Error('Verified calculated release report required');
  for (const r of source.predictions.filter(r => r.stage === 'setter')) {
    const old = externalRelease.get(r.counter);
    if (old && (old.position !== r.position || old.release !== r.release)) throw new Error('Ambiguous release timeline');
    externalRelease.set(r.counter, r);
  }
}
if (data.mode === 'worker' && !externalRelease.size) throw new Error('Worker capture needs a calculated release timeline');
const f = Math.fround, states = new Map(), buffers = new Map(), checks = [], failures = [];
const bits = x => { const v = new DataView(new ArrayBuffer(4)); v.setFloat32(0, x); return v.getUint32(0); };
let counter, layout, previousControls, voice, pending, node, initialized = false;
let modalBlocks = 0, outputSamples = 0, nodeSteps = 0;
const removals = [], blockReports = [], outputs = [];
const completeGroupOutputs = [];
let expectedKernels = [], kernelIndex = 0;
function finishBlock() {
  if (counter === undefined) return;
  if (kernelIndex !== expectedKernels.length) throw new Error(`Incomplete kernel block ${counter}`);
  for (let group = 0; group < layout.length; group++) {
    completeGroupOutputs.push({ counter, group, output: [...buffers.get(`${counter}:${group}`)] });
  }
}
function check(name, predicted, actual) {
  if (predicted.length !== actual.length) throw new Error(`Length mismatch: ${name}`);
  let mismatches = 0;
  for (let i = 0; i < predicted.length; i++) {
    if (!Number.isFinite(actual[i]) || !Number.isFinite(predicted[i])) throw new Error(`Nonfinite ${name}`);
    if (bits(predicted[i]) !== bits(actual[i])) {
      mismatches++;
      if (failures.length < 60) failures.push({ name, index: i, predicted: predicted[i], actual: actual[i] });
    }
  }
  checks.push({ name, count: predicted.length, mismatches });
}
const at = lane => {
  if (!states.has(lane)) states.set(lane, { P: 0, Q: 0, A: 0, B: 0 });
  return states.get(lane);
};
for (const r of data.records) {
  if (r.stage === 'producer') {
    if (!node) node = { position: r.currentPosition, intermediate: r.currentPosition };
    const dt = f(f(r.producerBlockSamples) / f(r.sampleRate));
    check(`node-${r.producerSampleCounter}-dt`, [dt], [r.dt]);
    if (r.velocity < 0) {
      node = advanceReleasedKey({ position: node.position, velocity: r.velocity,
        dt, keyCap: r.keyCap, softCap: r.softCap });
      nodeSteps++;
    } else {
      if (r.keyCap !== 1 || r.softCap !== 1 || node.position !== 1) throw new Error('Unverified held caps');
      node = { position: 1, intermediate: 1 };
    }
    check(`node-${r.producerSampleCounter}`, [node.position, node.intermediate], [r.nodePosition, r.nodeIntermediate]);
    const produced = produceReleasePosition({ ...r, ...node });
    check(`pending-${r.producerSampleCounter}`, Object.values(produced),
      [r.pendingPosition, r.pendingRelease, r.pendingDirection, r.pendingPedal]);
    pending = { source: r, produced };
  } else if (r.stage === 'coefficients') {
    finishBlock();
    if (counter !== undefined && r.counter !== counter + 64) throw new Error('Noncontiguous modal window');
    counter = r.counter;
    const c = r.controls, rf = r.releaseFields;
    if (r.input_mode !== 0 || r.layout_flag !== 0) throw new Error('Unsupported render mode');
    if (!initialized) {
      layout = r.groups.map(x => [...x]);
      for (const x of r.lanes) states.set(x.lane, { P: x.P, Q: x.Q, radius: x.R,
        K: x.K, S: x.S, sinInverse: x.sin_inverse, frequency: x.frequency,
        J: x.J, modalDecay: x.modal_decay, weight: x.position_weight, energy: x.energy,
        A: x.A, B: x.B });
      voice = { position: rf['0x8cc'], release: c['0x7e4'] > 0 ? 1 : 0,
        direction: c['0x7e4'] > 0 ? 0 : 1, pedalLatched: 0, pendingSamples: 0 };
    } else {
      const pruned = updateModalEnergyAndPrune(states, layout, { threshold: r.prune_threshold,
        energyLayout: r.energy_layout, keepSlots: r.keep_slots === 1, freezeLayout: false });
      layout = pruned.layout;
      removals.push(...pruned.removed.map(x => ({ counter, ...x })));
    }
    check(`${counter}-layout`, layout.flat(), r.groups.flat());
    if (pending) {
      const { source: p, produced } = pending;
      voice = consumeReleasePosition({ ...p, currentPosition: voice.position,
        currentRelease: voice.release, currentDirection: voice.direction,
        pedalLatched: voice.pedalLatched, pending: 1,
        pendingSamples: voice.pendingSamples, pendingPosition: produced.position,
        pendingRelease: produced.release, pendingDirection: produced.direction,
        pendingPedal: produced.pedal }, 64);
      pending = undefined;
    }
    if (externalRelease.size) {
      const calculated = externalRelease.get(counter);
      if (!calculated) throw new Error(`Calculated release missing counter ${counter}`);
      Object.assign(voice, { position: calculated.position, release: calculated.release,
        direction: calculated.direction });
    }
    check(`${counter}-release-position`, [voice.position], [rf['0x8cc']]);
    const release = voice.release ? releaseCoefficients({ x: rf['0x8c4'], u: voice.position,
      cubicScale: rf['0x91c'], polynomial: [0x914, 0x94c, 0x950, 0x954, 0x958].map(o => rf[`0x${o.toString(16)}`]),
      rateScale: rf['0x910'], gainScale: rf['0x90c'], cubicGainScale: rf['0x920'] })
      : { duration: 0, rate: 0, gain: 0 };
    check(`${counter}-release-coefficients`, Object.values(release), [rf['0x944'], c['0x7e4'], c['0x7b0']]);
    const refresh = initialized && (c['0x780'] !== previousControls['0x780'] || c['0x784'] !== previousControls['0x784']);
    for (const [start, , , count] of layout) {
      const end = Math.ceil((start + count) / 4) * 4;
      for (let lane = Math.floor(start / 4) * 4; lane < end; lane += 4) {
        const group = Array.from({ length: 4 }, (_, i) => at(lane + i));
        const angles = modalAngleGroup({ frequency: group.map(x => x.frequency),
          pitchAdjustment: group.map(x => x.J), timestep: c['0xc'], pitch: c['0x780'], adjustmentRatio: c['0x784'] });
        if (refresh) {
          const P = projectModalHistory({ P: group.map(x => x.P), Q: group.map(x => x.Q),
            oldRadius: group.map(x => x.radius), oldCosine: group.map(x => x.K),
            oldSinInverse: group.map(x => x.sinInverse), newSine: angles.S, newCosine: angles.K });
          group.forEach((x, i) => { x.P = P[i]; });
        }
        group.forEach((x, i) => { x.K = angles.K[i]; x.S = angles.S[i]; x.sinInverse = angles.sinInverse[i]; });
      }
    }
    const grouped = layout.map(([start, , , count]) => Array.from({ length: Math.ceil((start + count) / 4) * 4 - start },
      (_, i) => { const x = at(start + i); return { modalDecay: x.modalDecay, cosine: x.K, weight: x.weight, energy: x.energy }; }));
    const damping = refreshDampedModes(grouped, { timestep: c['0xc'], pitch: c['0x780'],
      scale: c['0x7f8'], release: release.rate, gain: release.gain, extraGain: c['0x7e0'],
      releaseShape: c['0x7ec'], blockLength: r.block_length_V768, blockFactor: r.block_factor_V810 });
    check(`${counter}-normalization`, [damping.normalization], [c['0x7e8']]);
    for (const [g, rows] of damping.groups.entries()) rows.forEach((x, i) => Object.assign(at(layout[g][0] + i), x));
    for (const x of r.lanes) {
      const s = at(x.lane);
      check(`${counter}-${x.lane}-source-energy`, [s.frequency, s.J, s.modalDecay, s.weight, s.energy],
        [x.frequency, x.J, x.modal_decay, x.position_weight, x.energy]);
      check(`${counter}-${x.lane}-state`, [s.P, s.Q, s.K, s.S, s.sinInverse, s.radius, s.A, s.B, s.decay],
        [x.P, x.Q, x.K, x.S, x.sin_inverse, x.R, x.A, x.B, x.effective_decay]);
    }
    previousControls = c;
    initialized = true;
    modalBlocks++;
    for (let g = 0; g < layout.length; g++) buffers.set(`${counter}:${g}`, new Float32Array(64));
    expectedKernels = layout.flatMap(([start, , , count], group) => {
      const first = Math.floor(start / 4) * 4;
      const length = Math.ceil((start + count) / 4) * 4 - first;
      const prefix = Math.floor(length / 16) * 16, remainder = length - prefix;
      if (remainder > 8) throw new Error('Unverified twelve-lane tail');
      const rows = Array.from({ length: prefix / 16 }, (_, i) => ({ lane: first + 16 * i, width: 16, group }));
      if (remainder) rows.push({ lane: first + prefix, width: 8, group });
      return rows;
    });
    kernelIndex = 0;
    blockReports.push({ counter, position: voice.position, rate: release.rate, gain: release.gain,
      normalization: damping.normalization, counts: layout.map(x => x[3]) });
  } else if (r.stage === 'sixteen' || r.stage === 'eight') {
    if (r.counter !== counter) throw new Error('Kernel without current coefficient snapshot');
    const groupIndex = layout.findIndex(([start, padded]) => r.lane >= start && r.lane < padded);
    if (groupIndex < 0) throw new Error('Kernel outside group');
    const width = r.stage === 'sixteen' ? 16 : 8, group = Array.from({ length: width }, (_, i) => at(r.lane + i));
    const expected = expectedKernels[kernelIndex++];
    if (!expected || expected.lane !== r.lane || expected.width !== width || expected.group !== groupIndex) {
      throw new Error('Missing or reordered group kernel');
    }
    const P = Float32Array.from(group, x => x.P), Q = Float32Array.from(group, x => x.Q);
    const A = Float32Array.from(group, x => x.A), B = Float32Array.from(group, x => x.B);
    const prefix = `${counter}-${r.lane}`;
    check(`${prefix}-P-before`, [...P], r.P_before); check(`${prefix}-Q-before`, [...Q], r.Q_before);
    const interleaved = [];
    for (let i = 0; i < width; i += 4) interleaved.push(...A.slice(i, i + 4), ...B.slice(i, i + 4));
    check(`${prefix}-AB`, interleaved, r.coefficients);
    const buffer = buffers.get(`${counter}:${groupIndex}`);
    (width === 16 ? renderSixteen : renderEight)(P, Q, A, B, buffer);
    check(`${prefix}-P-after`, [...P], r.P_after); check(`${prefix}-Q-after`, [...Q], r.Q_after);
    check(`${prefix}-output`, [...buffer], r.output);
    group.forEach((s, i) => { s.P = P[i]; s.Q = Q[i]; });
    outputSamples += buffer.length;
    outputs.push({ counter, group: groupIndex, lane: r.lane, output: [...buffer] });
  } else throw new Error('Unexpected stage');
}
finishBlock();
const mismatches = checks.reduce((n, c) => n + c.mismatches, 0);
const windowComplete = data.windowComplete && counter === data.counterWindow[1] &&
  modalBlocks === (data.counterWindow[1] - data.counterWindow[0]) / 64 + 1;
const report = { passed: mismatches === 0 && windowComplete, mismatches, windowComplete,
  comparedFloatValues: checks.reduce((n, c) => n + c.count, 0), modalBlocks, outputSamples, nodeSteps,
  initialWindowStateCapturedOnce: true, stateResetBetweenBlocks: false,
  energyFromOwnState: true, pruningFromOwnEnergy: true,
  pruningThresholdAndFreezeBranchStillInputs: true,
  sourceTablesControlsAndPositionWeightsCapturedInitially: true,
  pitchAndOtherHostControlsStillCaptured: true, wholeVoiceStereoAudioVerified: false,
  scheduleFromObservedEventOrder: !externalRelease.size,
  releaseControlsFromSeparateVerifiedRun: externalRelease.size > 0,
  completeGroupOutputSamples: completeGroupOutputs.length * 64,
  blockReports, removals, checks, failures, outputs, completeGroupOutputs };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, blockReports: undefined, removals: undefined,
  checks: undefined, failures: undefined, outputs: undefined, completeGroupOutputs: undefined }));
if (!report.passed) process.exitCode = 1;
