// Usage: node SCRIPT base-models.json source.json powf-oracle.json inputs.json [report]
import fs from 'node:fs';
import { prepareModalInputs, modePoleInputs } from '../dsp/modal-source.mjs';
import { archiveCouplingGrid, couplingArguments } from '../dsp/coupling-inputs.mjs';
const [basePath, sourcePath, powfPath, capturePath, reportPath] = process.argv.slice(2);
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const base = read(basePath)[0], sourceData = read(sourcePath), oracle = read(powfPath), capture = read(capturePath);
const source = sourceData.configurations ? { errors: sourceData.errors, records: Object.values(sourceData.configurations) } : sourceData;
if (source.errors.length || capture.errors.length || source.records.length !== 2 || !capture.records.length)
  throw new Error('Expected authentic captures for both source modes');
const view = new DataView(new ArrayBuffer(4));
const bits = value => { view.setFloat32(0, value); return view.getUint32(0); };
const equal = (a, b) => bits(a) === bits(b);
const sameArray = (a, b) => a.length === b.length && a.every((v, j) => equal(v, b[j]));
const grid = archiveCouplingGrid(base.fields), prepared = new Map(), failures = [], gridChecks = [], expectedKeys = new Set();
for (const row of source.records) {
  const key = `${row.note_index}:${row.mode}`, config = capture.configurations[key];
  if (!config || !equal(config.note, row.note) || config.base_extra_db !== 0)
    throw new Error('Missing coupled source configuration');
  if (!sameArray(grid.coordinates, config.pitch_coordinates) || grid.curves.length !== config.frequency_curves.length)
    throw new Error('Archive frequency grid differs');
  let gridValueCount = grid.coordinates.length;
  for (const [i, curve] of grid.curves.entries()) {
    const actual = config.frequency_curves[i];
    if (!sameArray(curve.x, actual.x) || !sameArray(curve.y, actual.y))
      throw new Error(`Archive frequency curve ${i} differs`);
    gridValueCount += curve.x.length + curve.y.length;
  }
  gridChecks.push({ key, gridValueCount, curveCount: grid.curves.length });
  const g = row.G_controls, c = row.cache_controls, v = row.G_vectors, w = row.cache_vectors;
  const native = oracle.records.filter(x => x.note_index === row.note_index && x.cache_mode === row.mode);
  if (native.length !== 1 || !equal(native[0].base, Math.fround(g['0x78'] / 440)) ||
      !equal(native[0].exponent, c['0x1a0']) || bits(native[0].result).toString(16).padStart(8, '0') !== native[0].result_bits)
    throw new Error('Independent powf oracle does not match these inputs');
  const input = prepareModalInputs({ frequency: g['0x78'], offsets: v['0x120'], offsetExponent: c['0x1a0'],
    stiffness: g['0x28'], componentStiffness: v['0x40'], spread: g['0x148'], frequencyRatios: w['0x1f8'],
    blend: c['0x270'], offsetScale: native[0].result });
  if (input.endpoints.length !== 1 || input.endpoints[0].kind !== 'coupled') throw new Error('Coupled endpoint capture required');
  const threshold = Math.min(c['0xf8'], Math.fround(g['0x98'] * 0.5)) * 0.99;
  for (const mode of w['0x1b8']) {
    if (modePoleInputs({ ...input.endpoints[0], mode }).center >= threshold) break;
    expectedKeys.add(`${key}:${mode}`);
  }
  prepared.set(key, { fundamental: g['0x78'], endpoint: input.endpoints[0], coordinateScale: c['0x1e0'], note: row.note,
    frequencyGrid: grid, runtimeCurveModes: config.frequency_curves.map(curve => ({
      flags: curve.log_x, special: curve.special_mode, dimension: curve.dimension })) });
}
const checks = [], keys = new Set();
let inputValues = 0, inputMismatches = 0;
for (const record of capture.records) {
  const args = prepared.get(record.key);
  if (!args) throw new Error('Unmatched source configuration');
  const key = `${record.key}:${record.modal_coordinate}`;
  if (keys.has(key)) throw new Error('Duplicate modal-coordinate capture');
  if (!expectedKeys.has(key)) throw new Error('Captured modal coordinate exceeds computed cutoff');
  keys.add(key);
  const prediction = couplingArguments({ ...args, mode: record.modal_coordinate });
  const config = capture.configurations[record.key];
  if (prediction.selection.left !== config.selected_indices[0] || prediction.selection.right !== config.selected_indices[1] ||
      !equal(prediction.selection.fraction, config.fraction)) failures.push({ key, stage: 'grid-selection', selection: prediction.selection });
  for (const name of ['s0', 's1', 's2', 's3']) {
    inputValues++;
    if (!equal(prediction.inputs[name], record.inputs[name])) {
      inputMismatches++; failures.push({ key, stage: 'four-inputs', name, prediction: prediction.inputs[name], actual: record.inputs[name] });
    }
  }
  checks.push({ key, ...prediction, actual: record.inputs });
}
for (const key of expectedKeys) if (!keys.has(key)) failures.push({ key, stage: 'missing-captured-call' });
const result = { model: base.strings[0], capturedCalls: capture.records.length, inputValues, inputMismatches,
  expectedCalls: expectedKeys.size, archiveGridVerified: true, gridChecks, nativePowfOracleRequired: true, sourceGAndCacheStillCaptured: true,
  checks, failures, passed: failures.length === 0 };
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, checks: undefined }, null, 2));
if (!result.passed) process.exitCode = 1;
