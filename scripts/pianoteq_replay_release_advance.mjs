// Real before/after observations; own state carries through successive calls.
import fs from 'node:fs';
import { advanceReleasedKey } from '../dsp/release-key-state.mjs';
import { releaseCoefficients } from '../dsp/physical-controls.mjs';

const [capturePath, reportPath, ...options] = process.argv.slice(2);
if (!capturePath || !reportPath) throw new Error('Usage: capture.json report.json');
if (options.length && (options.length !== 2 || options[0] !== '--coefficients')) {
  throw new Error('Optional: --coefficients damper-runtime.json');
}
const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
if (capture.errors.length || capture.unmatched_entries.length || !capture.records.length) {
  throw new Error('Incomplete or failed native capture');
}
const bits = value => {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return view.getUint32(0, true);
};
const states = new Map();
const comparisons = [];
const predictions = capture.records.map((record, index) => {
  const key = `${record.thread}:${record.node}`;
  // Only the first position is captured input. Later positions are our output.
  const input = states.has(key) ? states.get(key) : record.input_position;
  const predicted = advanceReleasedKey({ position: input, velocity: record.velocity,
    dt: record.dt, keyCap: record.key_cap, softCap: record.soft_cap });
  for (const [field, actual, expected] of [
    ['carried_input', record.input_position, input],
    ['position', record.actual_position, predicted.position],
    ['intermediate', record.actual_intermediate, predicted.intermediate],
  ]) comparisons.push({ index, field, actual, predicted: expected,
    bitEqual: bits(actual) === bits(expected) });
  states.set(key, predicted.position);
  return { index, keyIndex: record.key_index, ...predicted };
});
const report = { passed: comparisons.every(c => c.bitEqual),
  count: comparisons.length, matched: comparisons.filter(c => c.bitEqual).length,
  stateCarriedAcrossCalls: true, capsAndVelocityStillCaptured: true,
  outputObservation: capture.output_observation,
  completeKeyOrDamperModel: false, predictions, comparisons };
if (options.length) {
  const coefficients = JSON.parse(fs.readFileSync(options[1], 'utf8'));
  const records = coefficients.records.filter(r => r.kind === 'release_coefficients');
  if (coefficients.errors.length || !records.length || states.size !== 1) {
    throw new Error('Successful coefficient capture and one release node required');
  }
  const anchor = records[0].sample_counter;
  const step = records[0].previous_block_samples;
  if (!(step > 0) || records.some(r => r.previous_block_samples !== step) ||
      capture.records.some(r => r.dt !== capture.records[0].dt)) {
    throw new Error('Only the observed constant-block, constant-dt trajectory is supported');
  }
  const bridge = records.flatMap(record => {
    const index = (record.sample_counter - anchor) / step;
    if (!Number.isInteger(index) || !predictions[index]) {
      throw new Error('Counter outside the captured constant-block trajectory');
    }
    const u = predictions[index].position;
    const f = record.fields;
    const result = releaseCoefficients({ x: f['0x8c4'], u,
      cubicScale: f['0x91c'], polynomial: [0x914, 0x94c, 0x950, 0x954, 0x958].map(o => f[`0x${o.toString(16)}`]),
      rateScale: f['0x910'], gainScale: f['0x90c'], cubicGainScale: f['0x920'] });
    return [['position', u, f['0x8cc']], ['duration', result.duration, f['0x944']],
      ['rate', result.rate, f['0x7e4']], ['gain', result.gain, f['0x7b0']]]
      .map(([field, expected, actual]) => ({ counter: record.sample_counter,
        field, actual, predicted: expected, bitEqual: bits(actual) === bits(expected) }));
  });
  report.coefficientBridge = { crossRunTrajectoryComparison: true,
    counterAnchorCaptured: true, coefficientControlsStillCaptured: true,
    constantBlockSamples: step,
    count: bridge.length, matched: bridge.filter(c => c.bitEqual).length,
    comparisons: bridge };
  report.passed &&= bridge.every(c => c.bitEqual);
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, count: report.count, matched: report.matched,
  coefficientBridge: report.coefficientBridge && {
    count: report.coefficientBridge.count, matched: report.coefficientBridge.matched,
  } }));
if (!report.passed) process.exitCode = 1;
