// node SCRIPT initial.json final.json coefficients.json recurrence.json report.json
//   [--tail-capture tail.json]
//   [--pitch-report computed-pitch.json]
//   [--source-mapping-report computed-source-mapping.json]
import fs from 'node:fs';
import { initialModalGroup, initialModalRadii, dampInitialQ, modalAngleGroup, projectModalHistory } from '../dsp/modal-initial.mjs';
import { recurrenceCoefficients } from '../dsp/modal-coefficients.mjs';
import { renderSixteen, renderEight } from '../dsp/modal-kernel.mjs';
const [initialPath, finalPath, coefficientPath, recurrencePath, reportPath, ...options] = process.argv.slice(2);
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
let tailCapturePath, pitchReportPath, sourceMappingPath;
for (let i = 0; i < options.length; i++) {
  if (options[i] === '--tail-capture') tailCapturePath = options[++i];
  else if (options[i] === '--pitch-report') pitchReportPath = options[++i];
  else if (options[i] === '--source-mapping-report') sourceMappingPath = options[++i];
  else throw new Error('Expected --tail-capture, --pitch-report or --source-mapping-report');
}
const calculatedPitches = new Map();
if (pitchReportPath) {
  const report = read(pitchReportPath);
  if (report.schema !== 'pianoteq-dynamic-pitch-pass21' || report.passed !== true || report.mismatches !== 0 ||
      report.predictedControls?.length !== 64 || report.nativeMathOracleRequired !== false)
    throw new Error('Verified calculated frequency trajectory required');
  for (const row of report.predictedControls.filter(row => row.stage === 'held')) {
    if (!Number.isInteger(row.sampleAge) || !Number.isFinite(row.pitch) || calculatedPitches.has(row.sampleAge))
      throw new Error('Invalid or duplicate computed pitch age');
    calculatedPitches.set(row.sampleAge, row.pitch);
  }
  if (calculatedPitches.size !== 32 || !calculatedPitches.has(0)) throw new Error('Incomplete held pitch trajectory');
}
const calculatedPitchAt = (age, fallback) => {
  if (!pitchReportPath) return fallback;
  if (!calculatedPitches.has(age)) throw new Error(`Computed pitch missing age ${age}`);
  return calculatedPitches.get(age);
};
const initial = read(initialPath), final = read(finalPath), coefficients = read(coefficientPath), recurrence = read(recurrencePath);
for (const data of [initial, final, coefficients, recurrence])
  if (data.errors.length || !data.records.length) throw new Error('Incomplete capture');
if (initial.schema !== 1 || initial.stage !== 'initial' || initial.point !== '0x1008634d8' ||
    final.schema !== 1 || final.stage !== 'final' || final.point !== '0x100864d28' ||
    final.records.length !== 1 || recurrence.address !== '0x1007c0d50') throw new Error('Unexpected stages');
const cRecords = coefficients.records.filter(row => row.initial_flag === 1);
if (cRecords.length !== 1) throw new Error('Expected one initial coefficient snapshot');
const last = final.records[0], c = cRecords[0], layout = last.layout;
if (JSON.stringify(c.groups) !== JSON.stringify(layout) || c.input_mode !== 0 || c.layout_flag !== 0 || last.input_mode !== 0)
  throw new Error('Coefficient/initial layouts differ');
const view = new DataView(new ArrayBuffer(4));
const bits = value => { view.setFloat32(0, value); return view.getUint32(0).toString(16).padStart(8, '0'); };
const checks = [], failures = [];
function compare(name, prediction, actual) {
  if (prediction.length !== actual.length || !Array.from(actual).every(Number.isFinite)) throw new Error(`Incomplete ${name}`);
  let mismatches = 0;
  for (let i = 0; i < prediction.length; i++) if (bits(prediction[i]) !== bits(actual[i])) {
    mismatches++;
    if (failures.length < 40) failures.push({ name, index: i, predicted: prediction[i], actual: actual[i],
      predictedBits: bits(prediction[i]), actualBits: bits(actual[i]) });
  }
  checks.push({ name, count: prediction.length, mismatches });
}
const mappedSources = new Map();
if (sourceMappingPath) {
  const report = read(sourceMappingPath);
  if (report.schema !== 'pianoteq-voice-source-mapping-pass22' || report.passed !== true || report.mismatches !== 0 ||
      report.predictions?.length !== 1 || JSON.stringify(report.predictions[0].layout) !== JSON.stringify(layout))
    throw new Error('Verified source mapping with matching layout required');
  for (const row of report.predictions[0].lanes) {
    if (!Number.isInteger(row.lane) || mappedSources.has(row.lane) ||
        !['frequency', 'decay', 'amplitude', 'phase', 'J'].every(key => Number.isFinite(row[key])))
      throw new Error('Invalid mapped source lane');
    mappedSources.set(row.lane, row);
  }
  for (const record of initial.records) for (const [key, sourceKey] of Object.entries({
    frequency: 'frequency', amplitude_or_R: 'amplitude', phase: 'phase', J: 'J' })) {
    const calculated = Array.from({ length: 4 }, (_, i) => {
      const row = mappedSources.get(record.lane + i);
      if (!row) throw new Error('Incomplete mapped source');
      return row[sourceKey];
    });
    compare(`mapped-${record.lane}-${sourceKey}`, calculated, record[key]);
    record[key] = calculated;
  }
}
const sourceDecay = row => {
  if (!sourceMappingPath) return row.modal_decay;
  const mapped = mappedSources.get(row.lane);
  if (!mapped) throw new Error('Missing mapped decay');
  compare(`mapped-decay-${row.lane}`, [mapped.decay], [row.modal_decay]);
  return mapped.decay;
};
const expected = layout.flatMap(([start, , , count]) =>
  Array.from({ length: Math.ceil((start + count) / 4) - Math.floor(start / 4) }, (_, i) => 4 * (Math.floor(start / 4) + i)));
if (initial.records.length !== expected.length || new Set(initial.records.map(r => r.V)).size !== 1 ||
    !initial.records.every((r, i) => r.lane === expected[i] && r.input_mode === 0 &&
      JSON.stringify(r.layout) === JSON.stringify(layout))) throw new Error('Incomplete or reordered initial groups');
for (const row of [last, c]) compare('controls-match', Object.values(initial.records[0].controls),
  Object.keys(initial.records[0].controls).map(key => row.controls[key]));
const predicted = new Map();
compare('computed-initial-pitch', [calculatedPitchAt(0, initial.records[0].controls['0x780'])], [initial.records[0].controls['0x780']]);
for (const record of initial.records) {
  const controls = { ...record.controls, '0x780': calculatedPitchAt(0, record.controls['0x780']) };
  const result = initialModalGroup({ frequency: record.frequency, pitchAdjustment: record.J,
    amplitude: record.amplitude_or_R, phase: record.phase, timestep: controls['0xc'], pitch: controls['0x780'],
    adjustmentRatio: controls['0x784'], inputMode: record.input_mode });
  for (const [name, actual] of Object.entries({ theta: record.theta, sinTheta: record.sin_theta, cosTheta: record.cos_theta,
    sinPhase: record.sin_phase, cosPhase: record.cos_phase, P: record.P, Q: record.Q, energy: record.energy,
    S: record.S, K: record.K, sinInverse: record.sin_inverse })) compare(`initial-${record.lane}-${name}`, result[name], actual);
  for (let j = 0; j < 4; j++) predicted.set(record.lane + j, Object.fromEntries(
    ['P', 'Q', 'energy', 'S', 'K', 'sinInverse'].map(name => [name, result[name][j]])));
}
const decayGroups = layout.map((_, group) => c.lanes.filter(row => row.group === group));
const control = { ...c.controls, '0x780': calculatedPitchAt(0, c.controls['0x780']) };
const radii = initialModalRadii(decayGroups.map(group => group.map(sourceDecay)), {
  timestep: control['0xc'], pitch: control['0x780'], scale: control['0x7f8'], release: control['0x7e4'],
  positionGain: control['0x7b0'], extraGain: control['0x7e0'], releaseShape: control['0x7ec'] });
for (const [group, rows] of decayGroups.entries()) {
  compare(`group-${group}-effective-decay`, radii[group].decay, rows.map(row => row.effective_decay));
  compare(`group-${group}-radius`, radii[group].radius, rows.map(row => row.R));
  for (const [j, row] of rows.entries()) {
    const result = predicted.get(row.lane);
    if (!result) throw new Error('Missing predicted initial lane');
    result.radius = radii[group].radius[j];
    result.Q = dampInitialQ([result.Q], [result.radius])[0];
    Object.assign(result, recurrenceCoefficients(result.radius, result.K));
  }
}
if (last.lanes.length !== predicted.size || c.lanes.length !== predicted.size) throw new Error('Incomplete final lanes');
for (const row of last.lanes) {
  const before = initial.records.find(r => row.lane >= r.lane && row.lane < r.lane + 4);
  compare(`final-${row.lane}-frequency`, [before.frequency[row.lane - before.lane]], [row.frequency]);
  const result = predicted.get(row.lane);
  compare(`final-${row.lane}-state`, ['P', 'Q', 'energy', 'S', 'K', 'sinInverse', 'radius', 'A', 'B'].map(key => result[key]),
    ['P', 'Q', 'energy', 'S', 'K', 'sin_inverse', 'amplitude_or_R', 'A', 'B'].map(key => row[key]));
}
const blockStarts = layout.flatMap(([start, , , count]) =>
  Array.from({ length: Math.floor((Math.ceil((start + count) / 4) * 4 - Math.floor(start / 4) * 4) / 16) }, (_, i) => Math.floor(start / 4) * 4 + 16 * i));
const firstBlock = recurrence.records.slice(0, blockStarts.length), buffers = new Map();
if (firstBlock.length !== blockStarts.length) throw new Error('Missing recurrence groups');
const firstPointer = firstBlock[0].P_pointer;
let recurrenceOutputSamples = 0;
for (const [index, row] of firstBlock.entries()) {
  const start = (row.P_pointer - firstPointer) / 4;
  if (start !== blockStarts[index] || row.samples !== 64 || row.output_after.length !== 64)
    throw new Error('Recurrence first-block mapping differs');
  const laneValues = Array.from({ length: 16 }, (_, j) => predicted.get(start + j));
  if (laneValues.some(x => !x)) throw new Error('Recurrence includes uncaptured lanes');
  const P = Float32Array.from(laneValues, x => x.P), Q = Float32Array.from(laneValues, x => x.Q);
  const A = Float32Array.from(laneValues, x => x.A), B = Float32Array.from(laneValues, x => x.B);
  compare(`render-${index}-input-P`, P, row.P_before); compare(`render-${index}-input-Q`, Q, row.Q_before);
  const interleaved = [];
  for (let g = 0; g < 4; g++) interleaved.push(...A.slice(g * 4, g * 4 + 4), ...B.slice(g * 4, g * 4 + 4));
  compare(`render-${index}-coefficients`, interleaved, row.coefficients_interleaved);
  if (!buffers.has(row.output_pointer)) buffers.set(row.output_pointer, new Float32Array(64));
  const output = buffers.get(row.output_pointer);
  renderSixteen(P, Q, A, B, output);
  compare(`render-${index}-P-after`, P, row.P_after); compare(`render-${index}-Q-after`, Q, row.Q_after);
  compare(`render-${index}-output`, output, row.output_after);
  recurrenceOutputSamples += output.length;
}
let completeGroupBuffers = 0, tailGroups = 0, continuousBlocks = 0;
let frequencyRefreshCount = 0;
const predictedGroupBuffers = layout.map(() => []);
if (tailCapturePath) {
  const tail = read(tailCapturePath);
  const expectedTails = layout.map(([start, , , count], group) => {
    const padded = Math.ceil((start + count) / 4) * 4 - Math.floor(start / 4) * 4;
    return { group, start: Math.floor(start / 4) * 4, padded, prefix: Math.floor(padded / 16) * 16 };
  }).filter(x => x.padded % 16);
  if (tail.schema !== 1 || tail.address !== '0x1007c0ec4' || tail.errors.length || tail.records.length < expectedTails.length)
    throw new Error('Incomplete tail capture');
  const firstTailPointer = tail.records[0].P_pointer;
  for (const [index, expected] of expectedTails.entries()) {
    const row = tail.records[index], start = expected.start + expected.prefix;
    if (row.samples !== 64 || row.output_after.length !== 64 || expected.padded % 16 > 8 ||
        row.P_pointer - firstTailPointer !== (start - expectedTails[0].start - expectedTails[0].prefix) * 4)
      throw new Error('Unsupported tail layout or reordered snapshot');
    const states = Array.from({ length: 8 }, (_, i) => predicted.get(start + i) ?? { P: 0, Q: 0, A: 0, B: 0 });
    const P = Float32Array.from(states, x => x.P), Q = Float32Array.from(states, x => x.Q);
    const A = Float32Array.from(states, x => x.A), B = Float32Array.from(states, x => x.B);
    compare(`tail-${index}-input-P-including-padding`, P, row.P_before);
    compare(`tail-${index}-input-Q-including-padding`, Q, row.Q_before);
    compare(`tail-${index}-coefficients-including-padding`,
      [...A.slice(0, 4), ...B.slice(0, 4), ...A.slice(4), ...B.slice(4)], row.coefficients_interleaved);
    const prefixIndex = blockStarts.indexOf(start - 16);
    if (prefixIndex < 0) throw new Error('Tail without sixteen-lane prefix not covered');
    const output = buffers.get(firstBlock[prefixIndex].output_pointer);
    renderEight(P, Q, A, B, output);
    compare(`tail-${index}-P-after`, P, row.P_after); compare(`tail-${index}-Q-after`, Q, row.Q_after);
    compare(`tail-${index}-complete-group-output`, output, row.output_after);
    recurrenceOutputSamples += output.length;
    tailGroups++;
  }
  completeGroupBuffers = layout.length;
  // Extend the same calculated initial states through successive complete
  // blocks. Native before/after states remain comparison targets throughout.
  const blocks = Math.min(Math.floor(tail.records.length / expectedTails.length), Math.floor(recurrence.records.length / blockStarts.length));
  if (blocks < 1 || blocks > 16) throw new Error('Unexpected continuous-block extent');
  const running = new Map([...predicted].map(([lane, state]) => [lane, { ...state }]));
  const heldCoefficients = coefficients.records.filter(row => row.stage === 'held');
  if (heldCoefficients.length < blocks) throw new Error('Missing continuous control snapshots');
  let previousControls = control;
  const stateAt = lane => {
    if (!running.has(lane)) running.set(lane, { P: 0, Q: 0, A: 0, B: 0 });
    return running.get(lane);
  };
  for (let block = 0; block < blocks; block++) {
    const snapshot = heldCoefficients[block], nextControls = { ...snapshot.controls,
      '0x780': calculatedPitchAt(block * 64, snapshot.controls['0x780']) };
    compare(`continuous-${block}-computed-pitch`, [nextControls['0x780']], [snapshot.controls['0x780']]);
    if (snapshot.input_mode !== 0 || snapshot.layout_flag !== 0 || JSON.stringify(snapshot.groups) !== JSON.stringify(layout) ||
        snapshot.initial_flag !== (block === 0 ? 1 : 0)) throw new Error('Continuous coefficient stage changes');
    if (block > 0) {
      const refresh = nextControls['0x780'] !== previousControls['0x780'] || nextControls['0x784'] !== previousControls['0x784'];
      for (const record of initial.records) {
        const angles = modalAngleGroup({ frequency: record.frequency, pitchAdjustment: record.J,
          timestep: nextControls['0xc'], pitch: nextControls['0x780'], adjustmentRatio: nextControls['0x784'] });
        const states = Array.from({ length: 4 }, (_, i) => stateAt(record.lane + i));
        if (refresh) {
          const projected = projectModalHistory({ P: states.map(x => x.P), Q: states.map(x => x.Q),
            oldRadius: states.map(x => x.radius), oldCosine: states.map(x => x.K), oldSinInverse: states.map(x => x.sinInverse),
            newSine: angles.S, newCosine: angles.K });
          states.forEach((state, i) => { state.P = projected[i]; });
        }
        states.forEach((state, i) => { state.S = angles.S[i]; state.K = angles.K[i]; state.sinInverse = angles.sinInverse[i]; });
      }
      frequencyRefreshCount += refresh;
      const groups = layout.map((_, group) => snapshot.lanes.filter(row => row.group === group));
      const nextRadii = initialModalRadii(groups.map(rows => rows.map(sourceDecay)), {
        timestep: nextControls['0xc'], pitch: nextControls['0x780'], scale: nextControls['0x7f8'], release: nextControls['0x7e4'],
        positionGain: nextControls['0x7b0'], extraGain: nextControls['0x7e0'], releaseShape: nextControls['0x7ec'] });
      for (const [group, rows] of groups.entries()) for (const [i, row] of rows.entries()) {
        const state = stateAt(row.lane), record = initial.records.find(r => row.lane >= r.lane && row.lane < r.lane + 4);
        compare(`continuous-${block}-${row.lane}-frequency`, [record.frequency[row.lane - record.lane]], [row.frequency]);
        state.radius = nextRadii[group].radius[i];
        Object.assign(state, recurrenceCoefficients(state.radius, state.K));
        compare(`continuous-${block}-${row.lane}-refresh`,
          [state.P, state.Q, state.S, state.K, state.sinInverse, state.radius, state.A, state.B],
          [row.P, row.Q, row.S, row.K, row.sin_inverse, row.R, row.A, row.B]);
      }
    }
    previousControls = nextControls;
    let nativeIndex = block * blockStarts.length, tailIndex = block * expectedTails.length;
    for (const [group, [start, , , count]] of layout.entries()) {
      const paddedStart = Math.floor(start / 4) * 4, paddedLength = Math.ceil((start + count) / 4) * 4 - paddedStart;
      const prefix = Math.floor(paddedLength / 16) * 16, output = new Float32Array(64);
      const advance = (lane, width, native, render) => {
        if (native.samples !== 64 || native.output_after.length !== 64) throw new Error('Continuous block size changes');
        const states = Array.from({ length: width }, (_, i) => stateAt(lane + i));
        const P = Float32Array.from(states, x => x.P), Q = Float32Array.from(states, x => x.Q);
        const A = Float32Array.from(states, x => x.A), B = Float32Array.from(states, x => x.B);
        const name = `continuous-${block}-${group}-${lane}`;
        compare(`${name}-P-before`, P, native.P_before); compare(`${name}-Q-before`, Q, native.Q_before);
        const interleaved = [];
        for (let g = 0; g < width / 4; g++) interleaved.push(...A.slice(g * 4, g * 4 + 4), ...B.slice(g * 4, g * 4 + 4));
        compare(`${name}-coefficients`, interleaved, native.coefficients_interleaved);
        render(P, Q, A, B, output);
        compare(`${name}-P-after`, P, native.P_after); compare(`${name}-Q-after`, Q, native.Q_after);
        compare(`${name}-output`, output, native.output_after);
        for (let i = 0; i < width; i++) { states[i].P = P[i]; states[i].Q = Q[i]; }
      };
      for (let offset = 0; offset < prefix; offset += 16) {
        const native = recurrence.records[nativeIndex++];
        if ((native.P_pointer - firstPointer) / 4 !== paddedStart + offset) throw new Error('Continuous group mapping differs');
        advance(paddedStart + offset, 16, native, renderSixteen);
      }
      if (paddedLength % 16) {
        const native = tail.records[tailIndex++];
        if (native.P_pointer - firstTailPointer !== (paddedStart + prefix - expectedTails[0].start - expectedTails[0].prefix) * 4)
          throw new Error('Continuous tail mapping differs');
        advance(paddedStart + prefix, 8, native, renderEight);
      }
      predictedGroupBuffers[group].push(...output);
    }
  }
  continuousBlocks = blocks;
}
const report = { schema: 'pianoteq-modal-initial-pass20', passed: checks.every(x => x.mismatches === 0),
  initialGroups: initial.records.length, initialLanes: predicted.size, recurrenceGroups: firstBlock.length,
  recurrenceOutputSamples, comparedFloatValues: checks.reduce((n, x) => n + x.count, 0),
  mismatches: checks.reduce((n, x) => n + x.mismatches, 0), checks, failures,
  initialAmplitudePhaseFrequencyAndDecayStillCaptured: !sourceMappingPath,
  postExcitationSourceStillCaptured: true, sourceIndexMapStillCaptured: true,
  sourceToVoiceMappingComputed: Boolean(sourceMappingPath), radiusCalculated: true,
  nativeMathOracleRequired: false, eightLaneTailGroups: tailGroups, completeFirstGroupBuffers: completeGroupBuffers,
  completeFirstGroupBufferSamples: completeGroupBuffers * 64,
  tailsVerified: Boolean(completeGroupBuffers), continuousBlocks, continuousCompleteBufferSamples: continuousBlocks * layout.length * 64,
  frequencyRefreshCount, continuousControlInputsStillCaptured: true,
  frequencyTrajectoryComputed: Boolean(pitchReportPath),
  continuousStateResetFromCapture: false, predictedGroupBuffers, wholeVoiceAudioVerified: false };
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined, predictedGroupBuffers: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
