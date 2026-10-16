// Replay pass10 real snapshots; native vexpf differences remain explicit.
// node SCRIPT spectrum-runtime.json gain-runtime.json [report.json]
import fs from 'node:fs';
import { buildLogSpectrum, approximateExpWeights, nativeExpWeights, applyModalWeight } from '../dsp/excitation-spectrum.mjs';
const spectrum = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const gain = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
if (!spectrum.records.length || spectrum.errors.length || !gain.records.length || gain.errors.length) {
  throw new Error('Incomplete real capture');
}
const word = new DataView(new ArrayBuffer(4));
function bits(value) { word.setFloat32(0, value, true); return word.getUint32(0, true); }
let logValues = 0, logMismatches = 0, expBitMismatches = 0, maxExpAbsoluteError = 0;
let nativeExpMismatches = 0;
let fractionalCoordinates = 0, positiveSlopeRecords = 0, negativeSlopeRecords = 0;
for (const record of spectrum.records) {
  const log = buildLogSpectrum({ slope: record.slope, baseScale: record.base_scale,
    reference: record.reference, lower: record.lower, coordinates: record.coordinates,
    baseTable: record.base_table, extraTable: record.extra_table, count: record.count });
  const approximated = approximateExpWeights(log);
  const reconstructed = nativeExpWeights(log);
  positiveSlopeRecords += record.slope > 0;
  negativeSlopeRecords += record.slope < 0;
  for (let lane = 0; lane < 4; lane++) {
    const i = record.block * 4 + lane;
    if (i >= record.count || i >= record.coordinates.length) continue;
    logValues++;
    logMismatches += bits(log[i]) !== bits(record.log_before[lane]);
    fractionalCoordinates += record.coordinates[i] !== Math.floor(record.coordinates[i]);
    expBitMismatches += bits(approximated[i]) !== bits(record.exp_after[lane]);
    nativeExpMismatches += bits(reconstructed[i]) !== bits(record.exp_after[lane]);
    maxExpAbsoluteError = Math.max(maxExpAbsoluteError, Math.abs(approximated[i] - record.exp_after[lane]));
  }
}
let gainMismatches = 0;
for (const record of gain.records) {
  // Deliberately replay captured native H, never the approximate Math.exp value.
  gainMismatches += bits(applyModalWeight(record.amplitude_before, record.weight_raw)) !== bits(record.amplitude_after);
}
const result = {
  spectrum_records: spectrum.records.length, log_values: logValues,
  log_bit_mismatches: logMismatches,
  positive_slope_records: positiveSlopeRecords, negative_slope_records: negativeSlopeRecords,
  fractional_coordinates: fractionalCoordinates,
  native_vexpf_implemented: true,
  native_exp_bit_mismatches: nativeExpMismatches,
  approximate_exp_bit_mismatches: expBitMismatches,
  approximate_exp_max_absolute_error: maxExpAbsoluteError,
  gain_records_using_captured_native_weights: gain.records.length,
  gain_bit_mismatches: gainMismatches,
  exact_recovered_stages_passed: logMismatches === 0 && nativeExpMismatches === 0 && gainMismatches === 0,
  entire_native_pipeline_bit_exact: false,
};
const text = JSON.stringify(result, null, 2);
if (process.argv[4]) fs.writeFileSync(process.argv[4], text + '\n');
console.log(text);
process.exitCode = result.exact_recovered_stages_passed ? 0 : 1;
