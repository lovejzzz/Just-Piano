// Usage: node SCRIPT pole-input-runtime.json source-output-runtime.json amplitude-input-runtime.json powf-oracle.json [report.json]
// Lambda and coupling inputs must be captured at 194d68, never inferred from output.
import fs from 'node:fs';
import { coupledModes } from '../dsp/modal-poles.mjs';
import { prepareModalInputs, modePoleInputs } from '../dsp/modal-source.mjs';
const positional = [];
let impedanceReportPath;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--impedance-report') {
    if (!process.argv[i + 1]) throw new Error('Missing impedance report path');
    impedanceReportPath = process.argv[++i];
  } else positional.push(process.argv[i]);
}
const [inputPath, sourcePath, amplitudePath, powfPath, reportPath] = positional;
if (![inputPath, sourcePath, amplitudePath, powfPath].every(Boolean)) throw new Error('Expected three authentic runtime captures and independent powf oracle');
const input = JSON.parse(fs.readFileSync(inputPath));
const sources = JSON.parse(fs.readFileSync(sourcePath));
const amplitudes = JSON.parse(fs.readFileSync(amplitudePath));
const powfOracle = JSON.parse(fs.readFileSync(powfPath));
let impedanceReport;
const reconstructedCoupling = new Map();
if (impedanceReportPath) {
  impedanceReport = JSON.parse(fs.readFileSync(impedanceReportPath));
  if (impedanceReport.passed !== true || impedanceReport.controlsAndCurvesComputedFromArchives !== true ||
      impedanceReport.matchedRecords !== 36 || impedanceReport.outputValues !== 72 || impedanceReport.bitMismatches !== 0 || impedanceReport.jitterValues !== 72 || impedanceReport.jitterMismatches !== 0 ||
      impedanceReport.jitterChecks?.length !== 36 || impedanceReport.commonReturnBitMismatches !== 0)
    throw new Error('Impedance report must prove complete archive-derived 36-row / 72-value coupling replay');
  for (const row of impedanceReport.jitterChecks) {
    if (reconstructedCoupling.has(row.key) || row.errors?.length !== 2 ||
        !['p', 'q'].every(name => row.errors.filter(error => error.name === name && error.bitEqual === true && Number.isFinite(error.prediction)).length === 1))
      throw new Error('Invalid reconstructed coupling report schema');
    reconstructedCoupling.set(row.key, Object.fromEntries(row.errors.map(error => [error.name, error.prediction])));
  }
  const inputKeys = input.records.map(row => `${row.note_index}:${row.cache_mode}:${row.parameters.mode}`);
  if (new Set(inputKeys).size !== 36 || inputKeys.some(key => !reconstructedCoupling.has(key)))
    throw new Error('Impedance report does not cover exactly these captured modal input keys');
}
if (!powfOracle.records.length) throw new Error('Empty powf oracle');
for (const data of [input, sources, amplitudes])
  if (!data.records.length || data.errors.length) throw new Error('Incomplete runtime capture');
const view = new DataView(new ArrayBuffer(4));
function bits(value) { view.setFloat32(0, value); return view.getUint32(0); }
const same = (a, b) => bits(a) === bits(b);
const checks = [], failures = [], visited = new Set();
let lambdaCount = 0, lambdaMismatches = 0, centerCount = 0, centerMismatches = 0;
let reconstructedCouplingValues = 0, reconstructedCouplingMismatches = 0;
const preparedSources = new Map(), rowCountChecks = [];
for (const source of sources.records) {
  const g = source.G_controls, c = source.cache_controls, v = source.G_vectors, w = source.cache_vectors;
  const native = powfOracle.records.filter(row => row.note_index === source.note_index && row.cache_mode === source.mode);
  if (native.length !== 1) throw new Error('Expected unique powf oracle for source inputs');
  const row = native[0];
  if (!same(row.base, Math.fround(g['0x78'] / 440)) || !same(row.exponent, c['0x1a0']) ||
      bits(row.result).toString(16).padStart(8, '0') !== row.result_bits) throw new Error('Powf oracle input/result bits differ');
  const prepared = prepareModalInputs({ frequency: g['0x78'], offsets: v['0x120'], offsetExponent: c['0x1a0'],
    stiffness: g['0x28'], componentStiffness: v['0x40'], spread: g['0x148'],
    frequencyRatios: w['0x1f8'], blend: c['0x270'], offsetScale: row.result });
  if (prepared.endpoints.length !== 1 || prepared.endpoints[0].kind !== 'coupled')
    throw new Error('Only coupled endpoint is covered by this capture');
  const endpoint = prepared.endpoints[0];
  const threshold = Math.min(c['0xf8'], Math.fround(g['0x98'] * 0.5)) * 0.99;
  let predictedRows = 0;
  for (const mode of w['0x1b8']) {
    if (modePoleInputs({ ...endpoint, mode }).center >= threshold) break;
    predictedRows++;
  }
  const passed = predictedRows === source.matrices['0x10'].rows;
  rowCountChecks.push({ noteIndex: source.note_index, cacheMode: source.mode, predictedRows, observedRows: source.matrices['0x10'].rows, passed });
  if (!passed) failures.push({ stage: 'modal-cutoff-count', noteIndex: source.note_index, cacheMode: source.mode });
  preparedSources.set(`${source.note_index}:${source.mode}`, endpoint);
}
let frequencyCount = 0, decayCount = 0, frequencyMismatches = 0, decayMismatches = 0;
for (const [recordIndex, record] of input.records.entries()) {
  try {
    const parameters = record.parameters;
    const sourceMatches = sources.records.filter(source => source.note_index === record.note_index && source.mode === record.cache_mode);
    if (sourceMatches.length !== 1) throw new Error('Expected unique source matrix matching note_index/cache_mode');
    const source = sourceMatches[0], matrix = source.matrices['0x10'];
    const rows = source.modal_coordinates.map((value, j) => same(value, parameters.mode) ? j : -1).filter(j => j >= 0);
    if (rows.length !== 1) throw new Error('Expected unique explicitly captured modal-coordinate row');
    const row = rows[0];
    if (record.N !== matrix.cols || record.lambda.length !== matrix.cols) throw new Error('Component count differs from source matrix');
    const rawMatches = amplitudes.records.filter(amplitude => amplitude.frequency.rows === matrix.rows &&
      amplitude.frequency.cols === matrix.cols && amplitude.frequency.values.length === matrix.values.length &&
      amplitude.frequency.values.every((value, j) => same(value, matrix.values[j])));
    if (rawMatches.length !== 1) throw new Error('Expected unique original-decay capture matched by complete frequency matrix');
    const expectedFrequency = matrix.values.slice(row * matrix.cols, (row + 1) * matrix.cols);
    const expectedDecay = rawMatches[0].raw_decay.values.slice(row * matrix.cols, (row + 1) * matrix.cols);
    const endpoint = preparedSources.get(`${source.note_index}:${source.mode}`);
    const reconstructed = modePoleInputs({ ...endpoint, mode: parameters.mode });
    const lambdaErrors = record.lambda.map((value, j) => ({ prediction: reconstructed.lambda[j], actual: value,
      doubleEqual: Object.is(reconstructed.lambda[j], value), absoluteError: Math.abs(reconstructed.lambda[j] - value) }));
    lambdaCount += record.lambda.length; centerCount++;
    lambdaMismatches += lambdaErrors.filter(error => !error.doubleEqual).length;
    centerMismatches += !Object.is(reconstructed.center, parameters.center);
    if (lambdaErrors.some(error => !error.doubleEqual) || !Object.is(reconstructed.center, parameters.center))
      failures.push({ recordIndex, stage: 'source-controls-to-pole-inputs', lambdaErrors, predictedCenter: reconstructed.center, observedCenter: parameters.center });
    let coupling = parameters;
    if (impedanceReport) {
      coupling = reconstructedCoupling.get(`${record.note_index}:${record.cache_mode}:${parameters.mode}`);
      for (const name of ['p', 'q']) {
        reconstructedCouplingValues++;
        const equal = Object.is(coupling[name], parameters[name]);
        reconstructedCouplingMismatches += !equal;
        if (!equal) failures.push({ stage: 'reconstructed-impedance-input', recordIndex, name, prediction: coupling[name], actual: parameters[name] });
      }
    }
    const prediction = coupledModes(reconstructed.lambda, { ...parameters, p: coupling.p, q: coupling.q, center: reconstructed.center });
    const frequencyErrors = expectedFrequency.map((value, j) => ({ predicted: prediction.frequency[j], actual: value,
      bitEqual: same(prediction.frequency[j], value), absoluteError: Math.abs(prediction.frequency[j] - value) }));
    const decayErrors = expectedDecay.map((value, j) => ({ predicted: prediction.decay[j], actual: value,
      bitEqual: same(prediction.decay[j], value), absoluteError: Math.abs(prediction.decay[j] - value) }));
    frequencyCount += matrix.cols; decayCount += matrix.cols;
    frequencyMismatches += frequencyErrors.filter(error => !error.bitEqual).length;
    decayMismatches += decayErrors.filter(error => !error.bitEqual).length;
    const passed = [...frequencyErrors, ...decayErrors].every(error => error.bitEqual) &&
      lambdaErrors.every(error => error.doubleEqual) && Object.is(reconstructed.center, parameters.center);
    if (!passed) failures.push({ recordIndex, stage: 'lambda-to-frequency-decay', frequencyErrors, decayErrors });
    visited.add(`${record.note_index}:${record.cache_mode}:${row}`);
    checks.push({ recordIndex, noteIndex: record.note_index, cacheMode: record.cache_mode, row, modalCoordinate: parameters.mode,
      lambdaErrors, centerDoubleEqual: Object.is(reconstructed.center, parameters.center),
      frequencyErrors, decayErrors, coefficients: prediction.coefficients, independentRoots: prediction.solver.roots,
      residuals: prediction.solver.residuals, iterations: prediction.solver.iterations, passed });
  } catch (error) { failures.push({ recordIndex, stage: 'input-or-solver', error: error.message }); }
}
const missingRows = [];
for (const source of sources.records) for (let row = 0; row < source.matrices['0x10'].rows; row++)
  if (!visited.has(`${source.note_index}:${source.mode}:${row}`)) missingRows.push({ noteIndex: source.note_index, cacheMode: source.mode, row });
if (missingRows.length) failures.push({ stage: 'missing-source-rows', rows: missingRows });
const result = {
  capturedCalls: input.records.length, replayedCalls: checks.length, distinctRowsCovered: visited.size,
  frequencyCount, decayCount, frequencyMismatches, decayMismatches,
  lambdaCount, lambdaMismatches, centerCount, centerMismatches, rowCountChecks,
  nativeScalarPowfImplemented: false, powfOracleRecords: powfOracle.records.length,
  rootAlgorithm: 'independent Durand–Kerner, not native QR reproduction',
  polynomialConfiguration: { kappa: Math.PI, gamma: 0, provenance: 'pass7 actual global configuration capture; same binary' },
  sourceControlsToLambdaReconstructed: true, complexCouplingParameterProducerReconstructed: Boolean(impedanceReport),
  reconstructedCouplingValues, reconstructedCouplingMismatches,
  fourCouplingArgumentsReconstructed: impedanceReport?.fourArgumentsReconstructed === true,
  couplingSource: impedanceReport ? 'archive impedance calculation and deterministic jitter with platform math oracle' : 'captured p/q parameters',
  platformTranscendentalOracleRequired: Boolean(impedanceReport),
  checks, failures, passed: failures.length === 0,
};
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, checks: undefined }, null, 2));
if (failures.length) process.exitCode = 1;
