// Replay one run's ordered producer/consumer/setter observations with own state.
import fs from 'node:fs';
import { advanceReleasedKey } from '../dsp/release-key-state.mjs';
import { produceReleasePosition, consumeReleasePosition } from '../dsp/release-position-transfer.mjs';
import { releaseCoefficients } from '../dsp/physical-controls.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: runtime.json report.json');
const capture = JSON.parse(fs.readFileSync(input, 'utf8'));
if (![2, 3, 4].includes(capture.schemaVersion) || capture.mode !== 'combined' ||
    capture.errors.length || !capture.records.length) throw new Error('Complete schema-2/3/4 combined capture required');
const nodes = new Map(), voices = new Map(), comparisons = [], predictions = [];
const events = { producer: 0, consumer: 0, setter: 0, coefficients: 0 };
const bits = value => {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return view.getUint32(0, true);
};
const check = (record, field, actual, expected) => comparisons.push({
  index: predictions.length, counter: record.counter, stage: record.stage, field,
  actual, predicted: expected, bitEqual: bits(actual) === bits(expected),
});
for (const r of capture.records) {
  if (!voices.has(r.H)) {
    if (r.stage !== 'producer') throw new Error('Window must begin at producer');
    voices.set(r.H, { position: r.currentPosition, release: r.currentRelease,
      direction: r.currentDirection, pedalLatched: r.pedalLatched,
      pending: 0, pendingSamples: r.pendingSamples });
  }
  const s = voices.get(r.H);
  if (r.stage === 'producer') {
    if (r.overridePosition >= 0.5) throw new Error('Override branch outside this replay');
    const dt = capture.schemaVersion >= 4
      ? Math.fround(Math.fround(r.producerBlockSamples) / Math.fround(r.sampleRate)) : r.dt;
    if (capture.schemaVersion >= 4) check(r, 'producer.dt', r.dt, dt);
    let node = nodes.get(r.node);
    if (!node) node = { position: r.currentPosition, intermediate: r.currentPosition };
    if (r.velocity < 0) {
      node = advanceReleasedKey({ position: node.position, velocity: r.velocity,
        dt, keyCap: r.keyCap, softCap: r.softCap });
    } else {
      if (r.keyCap !== 1 || r.softCap !== 1 || node.position !== 1) {
        throw new Error('Held-node branch only validated with unit caps and position one');
      }
      node = { position: 1, intermediate: 1 };
    }
    nodes.set(r.node, node);
    check(r, 'node.position', r.nodePosition, node.position);
    check(r, 'node.intermediate', r.nodeIntermediate, node.intermediate);
    const produced = produceReleasePosition({ ...r, ...node });
    for (const [field, actual, expected] of [
      ['computed.position', r.computedPosition, produced.position],
      ['pending.position', r.pendingPosition, produced.position],
      ['pending.release', r.pendingRelease, produced.release],
      ['pending.direction', r.pendingDirection, produced.direction],
      ['computed.pedal', r.computedPendingPedal, produced.pedal],
      ['previous.position', r.currentPosition, s.position],
    ]) check(r, field, actual, expected);
    s.produced = produced;
    s.pending = 1;
    s.producerCounter = r.counter;
  } else if (r.stage === 'consumer') {
    if (!s.produced || s.producerCounter !== r.counter) throw new Error('Unpaired consumer');
    for (const [field, actual, expected] of [
      ['pending.flag', r.pending, s.pending],
      ['pending.samples', r.pendingSamples, s.pendingSamples],
      ['pending.position', r.pendingPosition, s.produced.position],
      ['pending.release', r.pendingRelease, s.produced.release],
      ['pending.direction', r.pendingDirection, s.produced.direction],
      ['pending.pedal', r.pendingPedal, s.produced.pedal],
      ['previous.position', r.currentPosition, s.position],
      ['previous.release', r.currentRelease, s.release],
      ['previous.direction', r.currentDirection, s.direction],
      ['previous.pedalLatch', r.pedalLatched, s.pedalLatched],
    ]) check(r, field, actual, expected);
    Object.assign(s, consumeReleasePosition({ ...r, pending: s.pending,
      pendingSamples: s.pendingSamples, currentPosition: s.position,
      currentRelease: s.release, currentDirection: s.direction,
      pedalLatched: s.pedalLatched, pendingPosition: s.produced.position,
      pendingRelease: s.produced.release, pendingDirection: s.produced.direction,
      pendingPedal: s.produced.pedal }, r.blockSamples));
    s.consumerCounter = r.counter;
  } else if (r.stage === 'setter') {
    if (s.consumerCounter !== r.counter) throw new Error('Setter without same-block consumer');
    if (!['0x10046030c', '0x100460324'].includes(r.caller)) throw new Error('Unverified setter owner');
    for (const [field, actual, expected] of [
      ['current.position', r.currentPosition, s.position],
      ['current.release', r.currentRelease, s.release],
      ['current.direction', r.currentDirection, s.direction],
      ['current.pedalLatch', r.pedalLatched, s.pedalLatched],
      ['pending.flag', r.pending, s.pending],
      ['pending.samples', r.pendingSamples, s.pendingSamples],
      ['setter.input', r.inputPosition, s.position],
      ['voice.position', r.voicePosition, s.position],
    ]) check(r, field, actual, expected);
  } else if (r.stage === 'coefficients') {
    if (s.consumerCounter !== r.counter) throw new Error('Unpaired coefficient refresh');
    const f = r.coefficientFields;
    const result = releaseCoefficients({ x: f['0x8c4'], u: s.position,
      cubicScale: f['0x91c'],
      polynomial: [0x914, 0x94c, 0x950, 0x954, 0x958].map(o => f[`0x${o.toString(16)}`]),
      rateScale: f['0x910'], gainScale: f['0x90c'], cubicGainScale: f['0x920'] });
    for (const [field, actual, expected] of [
      ['voice.position', r.voicePosition, s.position],
      ['duration', f['0x944'], result.duration],
      ['rate', f['0x7e4'], result.rate],
      ['gain', f['0x7b0'], result.gain],
    ]) check(r, field, actual, expected);
  } else throw new Error('Unexpected capture stage');
  events[r.stage]++;
  predictions.push({ stage: r.stage, counter: r.counter, node: r.node,
    position: s.position, release: s.release, direction: s.direction,
    pending: s.pending, pendingSamples: s.pendingSamples,
    nodePosition: r.node ? nodes.get(r.node).position : undefined });
}
if (!events.producer || !events.consumer || !events.setter) throw new Error('Missing pipeline stage');
if (capture.schemaVersion >= 3 && !events.coefficients) throw new Error('Missing coefficient refresh');
// A debugger can exit 0 after stopping the inferior prematurely. Partial
// numerical agreement does not certify the bounded observation completed.
const windowComplete = capture.hooks.length > 0 && capture.hooks.every(h => !h.enabled);
const numericalPassed = comparisons.every(c => c.bitEqual);
const report = { passed: numericalPassed && windowComplete, numericalPassed,
  windowComplete, nativeExitAndPcmMustBeCheckedSeparately: true, count: comparisons.length,
  matched: comparisons.filter(c => c.bitEqual).length, events,
  sameRunAssociation: true, nodeAndVoiceStateCarried: true,
  coefficientBridgeInSameRun: events.coefficients > 0,
  dtFromProducerBlockAndSampleRate: capture.schemaVersion >= 4,
  producerClockObservations: capture.records.filter(r => r.stage === 'producer')
    .map(r => ({ voiceCounter: r.counter, producerCounter: r.producerSampleCounter })),
  producerControlsAndConsumerCapsStillCaptured: true,
  coefficientPolynomialAndScalesStillCaptured: events.coefficients > 0,
  heldNodeBranchLimitedToUnitCaps: true,
  completeVoiceOrContactForceModel: false, predictions, comparisons };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, count: report.count,
  matched: report.matched, events }));
if (!report.passed) process.exitCode = 1;
