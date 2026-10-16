// Computed complete modal groups -> block carry -> bypass processor -> spread.
import fs from 'node:fs';
import { transportModalBlock, redistributeModalGroups, bypassPostModalProcessor } from '../dsp/post-modal-transport.mjs';
const [capturePath, reportPath, option, sourcePath, ...extra] = process.argv.slice(2);
if (!sourcePath || !capturePath || !reportPath || option !== '--source-report' || extra.length) {
  throw new Error('Usage: capture.json report.json --source-report computed-groups.json');
}
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const data = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
if (!source.passed || source.mismatches || !source.completeGroupOutputs?.length ||
    data.schema !== 1 || data.errors.length || !data.windowComplete || !data.records.length) {
  throw new Error('Verified computed groups and complete capture required');
}
const calculated = new Map();
for (const r of source.completeGroupOutputs) {
  const key = `${r.counter}:${r.group}`;
  if (calculated.has(key)) throw new Error('Ambiguous computed group output');
  calculated.set(key, r.output);
}
const bits = value => { const v = new DataView(new ArrayBuffer(4)); v.setFloat32(0, value); return v.getUint32(0); };
const checks = [], failures = [], predictions = [];
function check(name, prediction, actual) {
  if (prediction.length !== actual.length) throw new Error(`Incomplete ${name}`);
  let bad = 0;
  for (let i = 0; i < prediction.length; i++) {
    if (!Number.isFinite(prediction[i]) || !Number.isFinite(actual[i])) throw new Error(`Nonfinite ${name}`);
    if (bits(prediction[i]) !== bits(actual[i])) {
      bad++;
      if (failures.length < 40) failures.push({ name, index: i, predicted: prediction[i], actual: actual[i] });
    }
  }
  checks.push({ name, count: prediction.length, mismatches: bad });
}
let tails, current, filtered, lastCounter, blocks = 0, firstSourceAge;
let storedDelay, effectiveDelay, nonUnitySpread = false;
for (const [index, r] of data.records.entries()) {
  if (r.stage === 'before') {
    if (index && data.records[index - 1].stage !== 'spread') throw new Error('Previous stage incomplete');
    if (lastCounter !== undefined && r.counter !== lastCounter + r.renderSamples) throw new Error('Noncontiguous transport capture');
    lastCounter = r.counter;
    if (r.renderSamples !== 64 || r.channels.length !== 3 || r.rawModal.length !== 3) throw new Error('Unsupported transport shape');
    if (storedDelay === undefined) {
      storedDelay = r.delaySamples;
      effectiveDelay = Math.floor(storedDelay / 4) * 4;
    } else if (storedDelay !== r.delaySamples) throw new Error('Delay changes outside verified branch');
    const age = r.counter - r.renderSamples;
    const raw = Array.from({ length: 3 }, (_, group) => calculated.get(`${age}:${group}`));
    if (raw.some(x => !x)) {
      if (tails || blocks) throw new Error('Computed source missing inside window');
      // Only the leading transport history is read from the seed block.
      tails = r.rawModal.map(x => Float32Array.from(x.slice(64 - effectiveDelay)));
      current = undefined;
      continue;
    }
    if (!tails) throw new Error('Missing initial transport history');
    for (let group = 0; group < 3; group++) check(`${age}-${group}-raw`, raw[group], r.rawModal[group]);
    const result = transportModalBlock(raw, storedDelay, tails);
    tails = result.tails;
    current = result.output;
    firstSourceAge ??= age;
    for (let group = 0; group < 3; group++) check(`${age}-${group}-transport`, current[group], r.channels[group].values);
    blocks++;
  } else if (r.stage === 'after') {
    if (data.records[index - 1]?.stage !== 'before' || data.records[index - 1].counter !== r.counter) throw new Error('Unpaired processor stage');
    if (!current) continue;
    filtered = bypassPostModalProcessor(current, r.processor);
    for (let group = 0; group < 3; group++) check(`${r.counter}-${group}-processor`, filtered[group], r.channels[group].values);
  } else if (r.stage === 'spread') {
    if (data.records[index - 1]?.stage !== 'after' || data.records[index - 1].counter !== r.counter) throw new Error('Unpaired spread stage');
    if (!current) continue;
    nonUnitySpread ||= r.spread !== 1;
    const mixed = redistributeModalGroups(filtered, r.spread);
    for (let group = 0; group < 3; group++) check(`${r.counter}-${group}-spread`, mixed[group], r.channels[group].values);
    predictions.push({ counter: r.counter, sourceAge: r.counter - r.renderSamples,
      spread: r.spread, channels: mixed.map(x => [...x]) });
  } else throw new Error('Unexpected post-modal stage');
}
if (!blocks || data.records.at(-1).stage !== 'spread' || blocks * 3 !== source.completeGroupOutputs.length ||
    firstSourceAge !== source.completeGroupOutputs[0].counter) throw new Error('Incomplete computed-source coverage');
const mismatches = checks.reduce((n, x) => n + x.mismatches, 0);
const report = { passed: mismatches === 0, mismatches, count: checks.reduce((n, x) => n + x.count, 0),
  matched: checks.reduce((n, x) => n + x.count - x.mismatches, 0), windowComplete: true,
  blocks, storedDelaySamples: storedDelay, effectiveDelaySamples: effectiveDelay,
  initialTailCapturedOnce: true, rawModalBlocksComputed: true,
  modalBlocksFromSeparateVerifiedRun: true, nonUnitySpreadObserved: nonUnitySpread,
  activePostModalProcessorImplemented: false, finalStereoAudioVerified: false,
  predictions, checks, failures };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, predictions: undefined, checks: undefined, failures: undefined }));
if (!report.passed) process.exitCode = 1;
