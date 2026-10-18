import fs from 'node:fs';
import crypto from 'node:crypto';
import { GlobalModalRecurrence64 } from '../dsp/global-modal-recurrence.mjs';
import { fma32 } from '../dsp/modal-kernel.mjs';

const [input, destination, ...flags] = process.argv.slice(2);
const outputs = flags.filter(x => x.startsWith('--output-mono='));
if (!input || !destination || outputs.length > 1 || flags.some(x => !x.startsWith('--output-mono=') && !['--poison-body-target', '--poison-mono-target'].includes(x))) throw Error('Usage: capture fresh-report [--output-mono=NEW_FILE] [--poison-body-target|--poison-mono-target]');
const outputPath = outputs[0]?.slice('--output-mono='.length);
for (const file of [destination, outputPath].filter(Boolean)) if (fs.existsSync(file)) throw Error('Fresh report and output required');
const raw = fs.readFileSync(input), data = JSON.parse(raw);
if (!data.runStatus?.terminal || data.runStatus.exitStatus !== 0 || data.errors.length || data.pending || data.targetMutation !== false || data.observations.length !== 2320 || Object.keys(data.configs).length !== 3) throw Error('Complete primary mono observation required');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const floatHash = values => {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((x, i) => { if (!Number.isFinite(x)) throw Error('Finite modal data required'); bytes.writeFloatLE(x, i * 4); });
  return sha(bytes);
};
const models = new Map();
for (const [identity, config] of Object.entries(data.configs)) {
  if (floatHash(config.coefficients) !== config.coefficientSha256 || !config.coefficientVersions[config.coefficientSha256]) throw Error('Initial coefficient binding required');
  for (const [hash, values] of Object.entries(config.coefficientVersions)) if (values.length !== config.vectorCount * 16 || floatHash(values) !== hash) throw Error('Complete coefficient version binding required');
  models.set(identity, new GlobalModalRecurrence64(config));
}
let checks = 0, mismatches = 0, poisonedBody = false, poisonedMono = false, coefficientChanges = 0;
let nonzeroBody = 0, nonzeroMono = 0, nonzeroBefore = 0, nonzeroDirect = 0, queueBlocks = 0;
let bodyOutputTargetBlocks = 0;
const mismatchCounts = { state: 0, body: 0, mono: 0 };
const failures = [], parts = [], versions = new Map(Object.entries(data.configs).map(([id, c]) => [id, c.coefficientSha256]));
const word = new DataView(new ArrayBuffer(4));
const bits = x => { if (!Number.isFinite(x)) throw Error('Finite mono sample required'); word.setFloat32(0, x, true); return word.getUint32(0, true); };
function check(a, b, label) { checks++; if (!Object.is(a, b)) { mismatches++; mismatchCounts[label.includes('.mono.') ? 'mono' : label.includes('.body.') ? 'body' : 'state']++; if (failures.length < 12) failures.push({ label, actual: b, computed: a }); } }
function state(model, target, label) {
  check(model.counter, target.counter, label + '.counter');
  check(bits(model.previousInput), bits(target.previousInput), label + '.previous');
  check(floatHash(model.states), target.statesSha256, label + '.history');
  check(model.vectorCount, target.vectorCount, label + '.vectors');
  check(target.disabled, 0, label + '.enabled');
}
function rows(name, value) {
  if (value.length !== 1 || value[0].length !== 64) throw Error('Complete mono row required: ' + name);
  value[0].forEach(bits); return value[0];
}
function add(target, source, gain) {
  if (!Number.isFinite(gain)) throw Error('Finite mono gain required');
  if (gain === 0) return target;
  return Float32Array.from(target, (x, i) => fma32(source[i], gain, x));
}
for (const [block, item] of data.observations.entries()) {
  if (item.ordinal !== block || item.dispatch.variant !== 0 || item.dispatch.kernels.length !== 3 || item.after.length !== 3 || item.bodyInputs.length !== 3) throw Error('Complete three-kernel chronology required');
  const before = rows('before', item.bodyBefore);
  nonzeroBefore += before.filter(x => x !== 0).length;
  let body = Float32Array.from(before);
  for (let k = 0; k < 3; k++) {
    const current = item.dispatch.kernels[k], returned = item.after[k], model = models.get(current.object);
    if (!model || current.object !== returned.object || current.target !== '0x100657dfc') throw Error('Bound scalar modal owner required');
    if (versions.get(current.object) !== current.coefficientSha256) {
      const table = data.configs[current.object].coefficientVersions[current.coefficientSha256];
      if (!table) throw Error('Missing coefficient version');
      model.setCoefficients(table); versions.set(current.object, current.coefficientSha256); coefficientChanges++;
    }
    state(model, current, `${block}.${k}.before`);
    body = model.process64(rows('body input', item.bodyInputs[k]), body);
    state(model, returned, `${block}.${k}.after`);
  }
  const bodyTarget = item.bodyOutputObserved === false ? null : rows('body target', item.bodyOutput);
  if (bodyTarget) bodyOutputTargetBlocks++;
  body.forEach((x, i) => {
    if (bodyTarget) {
      let target = bits(bodyTarget[i]);
      if (flags.includes('--poison-body-target') && !poisonedBody && x !== 0) { target ^= 1; poisonedBody = true; }
      check(bits(x), target >>> 0, `${block}.body.${i}`);
    }
    if (x !== 0) nonzeroBody++;
  });
  let mono = body;
  const queue = item.queueReturn;
  if (![0, 1].includes(queue.enabled)) throw Error('Inspected queue flag required');
  if (queue.enabled === 1 && queue.hasFirst) {
    queueBlocks++;
    if (queue.gains.length !== 2 || queue.sources.length !== 2) throw Error('Complete queue return required');
    for (let k = 0; k < 2; k++) mono = add(mono, rows('queue source', queue.sources[k]), queue.gains[k]);
  }
  const direct = rows('direct source', item.directSource);
  nonzeroDirect += direct.filter(x => x !== 0).length;
  // 8dbc80 adds source x1 into destination x0. The direct matrix is a
  // different destination; only the drive scratch is added to the mono body.
  mono = add(mono, rows('drive scratch', item.driveScratch), item.scratchGain);
  const target = rows('mono target', item.monoTarget);
  mono.forEach((x, i) => {
    let actual = bits(target[i]);
    if (flags.includes('--poison-mono-target') && !poisonedMono && x !== 0) { actual ^= 1; poisonedMono = true; }
    check(bits(x), actual >>> 0, `${block}.mono.${i}`); if (x !== 0) nonzeroMono++;
  });
  parts.push(Buffer.from(mono.buffer, mono.byteOffset, mono.byteLength));
}
const computed = Buffer.concat(parts), passed = mismatches === 0 && nonzeroMono > 0;
const report = { schema: 1, passed, inputSha256: sha(raw), blocks: data.observations.length, checks, mismatches, failures,
  coefficientChanges, nonzeroBody, nonzeroMono, nonzeroBefore, nonzeroDirect, queueBlocks, mismatchCounts, bodyOutputTargetBlocks,
  computedMonoSha256: sha(computed), poisonedBody, poisonedMono,
  statesCarried: true, initialStatesRequiredZero: true, nativeModalHistoryUsedForPrediction: false,
  nativeBodyOutputUsedForPrediction: false, nativePreLatticeMonoUsedForPrediction: false,
  nativeModalInputsAndExistingMonoUsedForPrediction: true, nativeCoefficientVersionsUsedForPrediction: true,
  nativeDriveScratchUsedForPrediction: true, nativeQueueSourcesUsedForPrediction: queueBlocks > 0,
  nativeDirectSourceUsedForPrediction: false, independentEngineStereoVerified: false };
fs.writeFileSync(destination, JSON.stringify(report, null, 2), { flag: 'wx' });
if (outputPath) { if (!passed) throw Error('Only passing mono may export'); fs.writeFileSync(outputPath, computed, { flag: 'wx' }); }
console.log(JSON.stringify(report));
if (!passed || flags.includes('--poison-body-target') && !poisonedBody || flags.includes('--poison-mono-target') && !poisonedMono) process.exitCode = 1;
