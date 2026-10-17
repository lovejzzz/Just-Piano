// Usage: node SCRIPT base-models.json preset.json math-oracle capture.json [report.json]
//   [--additional-capture capture2.json] [--tuning-capture tuning.json]
//   [--curve-modes modes.json]
//   [--assume-linear-curves] [--base-index N]
// --curve-modes is {B1b40:{flags,special,dimension}, ...}; archive version
// words are not runtime flags. Assumed modes are reported as unverified.
import fs from 'node:fs';
import {nativeSourceMath} from '../dsp/native-source-math.mjs';
import { spawnSync } from 'node:child_process';
import { archiveSourceControls, sourceArchiveInputs, sourceStiffnessCents } from '../dsp/source-controls.mjs';
const args = process.argv.slice(2), positional = [], capturePaths = [];
let modePath, tuningPath, assumeLinear = false, baseIndex = 0, nativeMath = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--additional-capture') capturePaths.push(args[++i]);
  else if (args[i] === '--curve-modes') modePath = args[++i];
  else if (args[i] === '--tuning-capture') tuningPath = args[++i];
  else if (args[i] === '--assume-linear-curves') assumeLinear = true;
  else if (args[i] === '--base-index') baseIndex = Number(args[++i]);
  else if (args[i] === '--native-math' && !nativeMath) nativeMath = true;
  else if (args[i].startsWith('--')) throw new Error(`Unknown argument ${args[i]}`);
  else positional.push(args[i]);
}
const [basePath, presetPath, oraclePath, capturePath, reportPath] = positional;
if (!capturePath || positional.length > 5) throw new Error('Expected base-models preset oracle capture [report]');
if ([Boolean(modePath), Boolean(tuningPath), assumeLinear].filter(Boolean).length !== 1)
  throw new Error('Choose --tuning-capture, --curve-modes, or --assume-linear-curves');
capturePaths.unshift(capturePath);
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const base = read(basePath)[baseIndex], preset = read(presetPath);
if (!base?.fields || !preset.decoded_tail?.fields) throw new Error('Decoded archive fields required');
const curveNames = ['B1b40', 'B1b98', 'B2560', 'A490', 'A4e0', 'Af48'];
const tuning = tuningPath ? read(tuningPath) : null;
if (tuning && (tuning.errors?.length || !tuning.records?.length || !tuning.configurations?.length))
  throw new Error('Authentic tuning capture with configurations required');
const firstTuning = tuning?.configurations[0];
const capturedCurves = config => Object.fromEntries([
  ...Object.entries(config.base_curves).map(([key, curve]) => [`B${key.slice(2)}`, curve]),
  ...Object.entries(config.preset_curves).map(([key, curve]) => [`A${key.slice(2)}`, curve]),
]);
const runtimeCurveModes = firstTuning ? Object.fromEntries(Object.entries(capturedCurves(firstTuning)).map(([name, curve]) => [name,
  { flags: curve.log_x, special: curve.special_mode, dimension: curve.dimension }]))
  : modePath ? read(modePath) : Object.fromEntries(curveNames.map(name => [name, { flags: 0, special: 0, dimension: 1 }]));
const view = new DataView(new ArrayBuffer(8));
const bits64 = value => { view.setFloat64(0, value); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
const from64 = word => { view.setBigUint64(0, BigInt(`0x${word}`)); return view.getFloat64(0); };
const bits32 = value => { view.setFloat32(0, value); return view.getUint32(0).toString(16).padStart(8, '0'); };
const calls = new Map(), math = {};
for (const op of ['powf', 'expf', 'log10f', 'log2', 'exp2', 'log2f']) {
  math[op] = (...values) => {
    const words = values.map(bits64), key = `${op}:${words.join(':')}`;
    if (!calls.has(key)) {
      let outputBits;
      if (nativeMath) outputBits = bits64(nativeSourceMath[op](...values));
      else {
        const result = spawnSync(oraclePath, [op, ...words], { encoding: 'utf8' });
        if (result.status !== 0 || !/^[0-9a-f]{16}\s*$/.test(result.stdout))
          throw new Error(`Native math oracle failed: ${key}: ${result.stderr}`);
        outputBits = result.stdout.trim();
      }
      calls.set(key, { operation: op, inputBits: words, inputs: values, outputBits, result: from64(outputBits) });
    }
    return calls.get(key).result;
  };
}
const checks = [], failures = [], predictions = new Map();
let comparedValues = 0;
function check(key, name, predicted, actual) {
  if (!Number.isFinite(actual)) throw new Error(`Missing actual ${key}/${name}`);
  const actualBits = bits32(actual), predictedBits = bits32(predicted);
  comparedValues++;
  if (actualBits !== predictedBits) failures.push({ key, name, predicted, actual, predictedBits, actualBits });
}
const archive = sourceArchiveInputs(base.fields, preset.decoded_tail.fields), curveChecks = [];
if (tuning) {
  for (const [index, config] of tuning.configurations.entries()) {
    if (config.tuning_controls['0x280'] !== 0) throw new Error('Captured tuning scale requires unimplemented ageing branch');
    const curves = capturedCurves(config);
    for (const name of curveNames) {
      const actual = curves[name], expected = archive.curves[name], mode = runtimeCurveModes[name];
      if (!actual || actual.log_x !== mode.flags || actual.special_mode !== mode.special || actual.dimension !== mode.dimension)
        throw new Error(`Runtime curve modes change between configurations: ${name}`);
      for (const axis of ['x', 'y']) {
        if (actual[axis].length !== expected[axis].length) throw new Error(`Archive curve shape differs ${name}/${axis}`);
        actual[axis].forEach((value, j) => check(`curve-config:${index}`, `${name}.${axis}[${j}]`, expected[axis][j], value));
      }
    }
    if (config.component_ratios.length !== archive.model.vectors[0].length) throw new Error('Component ratios shape differs');
    config.component_ratios.forEach((value, j) => check(`tuning-config:${index}`, `ratio[${j}]`, archive.model.vectors[0][j], value));
    curveChecks.push({ configuration: index, curveCount: curveNames.length });
  }
}
for (const path of capturePaths) {
  const data = read(path);
  if (data.errors?.length) throw new Error('Capture contains errors');
  const records = data.configurations ? Object.values(data.configurations) : data.records;
  if (!records?.length) throw new Error('Capture has no source records');
  for (const record of records) {
    const note = record.note, key = `${record.note_index}:${record.mode}`;
    if (note !== record.note_index) throw new Error('Only integer pitch capture supported');
    if (!predictions.has(note)) predictions.set(note, archiveSourceControls({ baseFields: base.fields,
      presetFields: preset.decoded_tail.fields, note, runtimeCurveModes, math }));
    const prediction = predictions.get(note), actual = record.G_controls, vectors = record.G_vectors;
    if (!actual || !vectors) throw new Error('Full G controls/vectors missing');
    check(key, 'G28', prediction.stiffness, actual['0x28']);
    check(key, 'G148', prediction.spread, actual['0x148']);
    for (const [name, predicted, offset] of [['G40', prediction.componentStiffness, '0x40'], ['G120', prediction.offsets, '0x120']]) {
      if (!Array.isArray(vectors[offset]) || vectors[offset].length !== predicted.length)
        throw new Error(`Vector shape differs ${key}/${name}`);
      predicted.forEach((value, j) => check(key, `${name}[${j}]`, value, vectors[offset][j]));
    }
    checks.push({ key, capture: path, note, prediction, actual: { stiffness: actual['0x28'], spread: actual['0x148'],
      componentStiffness: vectors['0x40'], offsets: vectors['0x120'] } });
  }
}
let nativeDoubleValues = 0, nativeDoubleMismatches = 0, tuningStiffnessValues = 0;
const stiffnessTable = tuning ? Array.from({ length: 128 }, (_, note) => {
  const result = sourceStiffnessCents(archive, note, runtimeCurveModes, math);
  return { note, ...result, stiffnessDouble: math.exp2(result.cents / 600) - 1 };
}) : [];
if (tuning) {
  for (const [index, config] of tuning.configurations.entries()) {
    if (config.stiffness_table.length !== 128) throw new Error('Full 128-entry native stiffness table required');
    config.stiffness_table.forEach((actual, note) => {
      const predicted = stiffnessTable[note].stiffnessDouble;
      nativeDoubleValues++;
      if (bits64(actual) !== bits64(predicted)) {
        nativeDoubleMismatches++;
        failures.push({ key: `tuning-config:${index}`, name: `native-stiffness-double[${note}]`, actual, predicted,
          actualBits: bits64(actual), predictedBits: bits64(predicted) });
      }
    });
  }
  const repeated = new Map(), notes = new Set();
  for (const [index, record] of tuning.records.entries()) {
    const note = record.note_index;
    if (!Number.isInteger(note) || note < 0 || note > 127 || record.note !== note) throw new Error('Bad tuning capture note');
    const key = `tuning:${index}:${note}`;
    check(key, 'G28', Math.fround(stiffnessTable[note].stiffnessDouble), record.G_controls['0x28']);
    tuningStiffnessValues++;
    const ratios = archive.model.vectors[0];
    if (record.component_stiffness.length !== ratios.length) throw new Error('Bad tuning component stiffness shape');
    const prediction = archiveSourceControls({ baseFields: base.fields, presetFields: preset.decoded_tail.fields,
      note, runtimeCurveModes, math });
    prediction.componentStiffness.forEach((value, j) => {
      check(key, `G40[${j}]`, value, record.component_stiffness[j]); tuningStiffnessValues++;
    });
    const fingerprint = [record.G_controls['0x28'], ...record.component_stiffness].map(bits32).join(':');
    if (repeated.has(note) && repeated.get(note) !== fingerprint) failures.push({ key, name: 'repeated-note-state-differs' });
    repeated.set(note, fingerprint); notes.add(note);
    checks.push({ key, tuningOnly: true, note, componentNotes: prediction.componentNotes });
  }
  const low = firstTuning.tuning_integers['0xe8'], high = firstTuning.tuning_integers['0x100'];
  const width = high - low + 1;
  if (!Number.isInteger(low) || !Number.isInteger(high) || low < 0 || high > 127 || width < 1 || tuning.records.length % width)
    throw new Error('Incomplete tuning capture pass');
  for (const [index, record] of tuning.records.entries()) {
    if (record.note_index !== low + index % width) throw new Error('Incomplete or unordered tuning capture pass');
  }
}
const report = { schema: 'pianoteq-source-controls-pass17', model: base.strings?.[0],
  configurationCount: checks.filter(row => !row.tuningOnly).length, distinctNotes: predictions.size, comparedValues, bitMismatches: failures.length,
  platformTranscendentalOracleRequired: !nativeMath, recoveredNativeMathImplemented: nativeMath, runtimeCurveModesCaptured: Boolean(tuningPath),
  suppliedCurveModesOnly: Boolean(modePath), archiveCurvesVerified: Boolean(tuningPath), curveChecks,
  runtimeCurveModes, ageingZeroRequiredForFullControls: true,
  nativeIntermediateStiffnessDoubleVerified: Boolean(tuningPath) && nativeDoubleMismatches === 0,
  nativeDoubleValues, nativeDoubleMismatches, tuningStiffnessValues, tuningRecords: tuning?.records.length ?? 0,
  stiffnessTable, oracleUniqueCalls: nativeMath ? 0 : calls.size, computedMathUniqueCalls: nativeMath ? calls.size : 0,
  computedMathCalls: nativeMath ? Array.from(calls.values()) : [],
  checks, failures, oracleCalls: nativeMath ? [] : Array.from(calls.values()), passed: failures.length === 0 };
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined, stiffnessTable: undefined, oracleCalls: undefined, computedMathCalls: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
