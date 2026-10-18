import fs from 'node:fs';
import crypto from 'node:crypto';
import { GlobalRawKeys } from '../dsp/global-raw-keys.mjs';
import { GlobalDriveLevel } from '../dsp/global-drive-level.mjs';

const [input, destination, ...flags] = process.argv.slice(2);
const outputs = flags.filter(x => x.startsWith('--output-levels='));
if (!input || !destination || outputs.length > 1 || flags.some(x => !x.startsWith('--output-levels=') && !['--poison-level-target', '--poison-key-position-target', '--poison-pair-target'].includes(x))) throw Error('Usage: complete-capture fresh-report [--output-levels=NEW_FILE] [--poison-level-target|--poison-key-position-target|--poison-pair-target]');
const outputPath = outputs[0]?.slice('--output-levels='.length);
for (const file of [destination, outputPath].filter(Boolean)) if (fs.existsSync(file)) throw Error('Fresh level artifacts required');
const bytes = fs.readFileSync(input), data = JSON.parse(bytes);
if (!data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.errors.length || data.pending || data.targetMutation !== false || data.records.length !== 2320 || !data.initial) throw Error('Complete primary key/level capture required');
if (data.warmups?.length !== 1 || data.warmups[0].kind !== 'initialization' || data.warmups[0].callerSites[0] !== '0x1006b95e8') throw Error('Actual zero-time initialization call required');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const initial = data.initial;
if (initial.rawKeys.keys.some(key => (key.flags[0] & 1) && !(key.flags[1] & 1) && key.nodes.some(node => !Object.is(node.position, 0))))
  throw Error('Initial live raw-node position must be zero');
// Initial values of disabled/held nodes are overwritten by the zero-time update.
// Intermediate values are written before being read. Neither seeds own history.
const coldKeys = structuredClone(initial.rawKeys);
for (const key of coldKeys.keys) for (const node of key.nodes) { node.position = 0; node.intermediate = 0; }
const raw = new GlobalRawKeys(coldKeys), sensor = new GlobalDriveLevel({ weights: initial.weights,
  sampleRate: 48000, enabledGain: initial.enabledGain, initialReset: initial.reset });
const word = new DataView(new ArrayBuffer(4));
const bits = x => { if (!Number.isFinite(x)) throw Error('Finite key/level data required'); word.setFloat32(0, x, true); return word.getUint32(0, true); };
let checks = 0, mismatches = 0, nonzero = 0, poisoned = false;
let poisonedPosition = false, poisonedPair = false;
const failures = [], output = Buffer.alloc(data.records.length * 4);
function check(a, b, label) { checks++; if (!Object.is(a, b)) { mismatches++; if (failures.length < 16) failures.push({ label, computed: a, target: b }); } }
function pairs(target, label) {
  if (target.length !== sensor.weights.length) throw Error('Complete sensor pairs required');
  target.forEach(([timer, previous], i) => {
    let actual = bits(timer);
    if (flags.includes('--poison-pair-target') && !poisonedPair && label.endsWith('.after') && timer !== 0 && sensor.weights[i] !== 0) { actual ^= 1; poisonedPair = true; }
    check(bits(sensor.timers[i]), actual >>> 0, `${label}.${i}.timer`); check(bits(sensor.previous[i]), bits(previous), `${label}.${i}.previous`);
  });
}
check(bits(sensor.timeStep), bits(initial.timeStep), 'initial.timeStep'); pairs(initial.pairs, 'initial');
const phases = [{ block: -1, item: data.warmups[0], warmup: true }, ...data.records.map((item, block) => ({ item, block, warmup: false }))];
for (const { block, item, warmup } of phases) {
  if (item.ordinal !== (warmup ? 0 : block) || item.rawBefore.samples !== 64 || item.rawBefore.sampleRate !== 48000) throw Error('Complete fixed-rate sensor chronology required');
  check(item.frameEndTarget, warmup ? 0 : (block + 1) * 64, `${block}.clock`);
  check(bits(sensor.timeStep), bits(item.timeStepTarget), `${block}.sensorDt`);
  check(bits(warmup ? 0 : sensor.timeStep), bits(item.dtTarget), `${block}.rawDt`);
  check(bits(sensor.enabledGain), bits(item.enabledGainTarget), `${block}.enabledGain`);
  check(Number(sensor.reset), item.resetTarget, `${block}.reset`);
  pairs(item.pairsBefore, `${block}.before`);
  const keys = raw.process(item.rawBefore, warmup ? { timeStep: 0 } : {});
  if (keys.values.length !== item.input.length) throw Error('Complete raw-to-sensor key inventory required');
  keys.values.forEach((x, i) => check(bits(x), bits(item.input[i]), `${block}.rawKey.${i}`));
  for (const key of item.rawAfter.keys) for (const node of key.nodes) {
    const own = raw.nodes.get(node.object);
    if (!own) throw Error('Actual raw node must have a computed predecessor');
    let positionTarget = bits(node.position);
    if (flags.includes('--poison-key-position-target') && !poisonedPosition && (key.flags[0] & 1) && node.position !== 0) { positionTarget ^= 1; poisonedPosition = true; }
    check(bits(own.position), positionTarget >>> 0, `${block}.node.position`);
    check(bits(own.intermediate), bits(node.intermediate), `${block}.node.intermediate`);
  }
  const cap = Math.max(item.rawBefore.pedalControl, item.rawBefore.extraPedalControl);
  check(bits(cap), bits(item.cap), `${block}.cap`);
  const level = sensor.process(keys.values, cap);
  pairs(item.pairsAfter, `${block}.after`);
  let target = bits(item.levelTarget);
  if (flags.includes('--poison-level-target') && !poisoned && level !== 0) { target ^= 1; poisoned = true; }
  check(bits(level), target >>> 0, `${block}.level`);
  if (!warmup) { if (level !== 0) nonzero++; output.writeFloatLE(level, block * 4); }
  else check(bits(level), bits(0), 'initialization.level');
}
const passed = mismatches === 0 && nonzero > 0;
const report = { schema: 1, passed, inputSha256: sha(bytes), blocks: data.records.length, checks, mismatches, failures, nonzero, poisoned,
  poisonedPosition, poisonedPair,
  crossings: sensor.crossings, expiries: sensor.expiries, rawNodeBirths: raw.nodeBirths, computedLevelsSha256: sha(output),
  initializationCalls: data.warmups.length, initialSensorPairsComputedFromZero: true,
  initialRawHistoryComputedFromZero: true, overwrittenInitialNodeValuesNotLoaded: true,
  nativeKeyPositionsUsedForPrediction: false, nativeSensorPairsUsedForPrediction: false, nativeDriveLevelUsedForPrediction: false,
  rawNodeVelocitiesFlagsAndListsStillObserved: true, staticWeightsStillObserved: true, initialResetStillObserved: true,
  independentEngineStereoVerified: false };
fs.writeFileSync(destination, JSON.stringify(report, null, 2), { flag: 'wx' });
if (outputPath) { if (!passed) throw Error('Only passing level computation may export'); fs.writeFileSync(outputPath, output, { flag: 'wx' }); }
console.log(JSON.stringify(report));
if (!passed || flags.includes('--poison-level-target') && !poisoned || flags.includes('--poison-key-position-target') && !poisonedPosition || flags.includes('--poison-pair-target') && !poisonedPair) process.exitCode = 1;
