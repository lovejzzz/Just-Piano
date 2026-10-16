// Verify pass11 live coefficient snapshots with explicit phase boundaries.
// Usage: node SCRIPT runtime.json [report.json]
import fs from 'node:fs';
import { baseDecay, positionAdjustedDecay, energyNormalization,
  recurrenceCoefficients, smallExpPolynomial, expPolynomial } from '../dsp/modal-coefficients.mjs';
import { nativeVectorExpLane } from '../dsp/native-vector-exp.mjs';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!data.records.length || data.errors.length) throw new Error('Invalid capture');
const bits = new DataView(new ArrayBuffer(4));
function same(a, b) {
  bits.setFloat32(0, a, true); const x = bits.getUint32(0, true);
  bits.setFloat32(0, b, true); return x === bits.getUint32(0, true);
}
const result = { records: data.records.length, valid_lanes: 0,
  decay_components: 0, decay_using_captured_normalization_mismatches: 0,
  normalization_components: 0, normalization_bit_mismatches: 0, normalization_max_absolute_error: 0,
  radius_paired_components: 0, radius_paired_bit_mismatches: 0,
  radius_system_exp_tail_components: 0, radius_system_exp_tail_bit_mismatches: 0,
  radius_system_exp_tail_max_absolute_error: 0,
  AB_components: 0, AB_bit_mismatches: 0, checks: [] };
for (const record of data.records) {
  if (record.layout_flag !== 0 || record.input_mode !== 0) throw new Error('Unverified coefficient layout');
  const c = record.controls;
  if (c['0x7ec'] !== 1 || c['0x7e0'] !== 0) throw new Error('Unverified damping frequency branch');
  const getBase = (lane) => baseDecay(lane.modal_decay, c['0x780'], c['0x7f8'], c['0x7e4']);
  const groups = record.groups.map((_, i) => record.lanes.filter((lane) => lane.group === i));
  const normalization = c['0x7b0'] === 0 ? 0 : energyNormalization(
    groups.map((group) => group.map((lane) => ({ base: getBase(lane), weight: lane.position_weight, energy: lane.energy }))),
    { timestep: c['0xc'], blockLength: record.block_length_V768,
      blockFactor: record.block_factor_V810, gain: c['0x7b0'] });
  result.normalization_components++;
  result.normalization_bit_mismatches += !same(normalization, c['0x7e8']);
  result.normalization_max_absolute_error = Math.max(result.normalization_max_absolute_error, Math.abs(normalization - c['0x7e8']));
  for (const group of groups) {
    const pairedLength = Math.floor(group.length / 8) * 8;
    for (let i = 0; i < group.length; i++) {
      const lane = group[i];
      if (!lane.valid) continue;
      result.valid_lanes++;
      const predictedDecay = c['0x7b0'] === 0 ? getBase(lane)
        : positionAdjustedDecay(getBase(lane), c['0x7b0'], lane.position_weight, c['0x7e8']);
      result.decay_components++;
      result.decay_using_captured_normalization_mismatches += !same(predictedDecay, lane.effective_decay);
      const x = Math.fround(-c['0xc'] * lane.effective_decay);
      if (i < pairedLength) {
        const pair = group.slice(Math.floor(i / 8) * 8, Math.floor(i / 8) * 8 + 8);
        const fast = pair.every((mode) => Math.abs(Math.fround(-c['0xc'] * mode.effective_decay)) <= Math.fround(0.15));
        const predicted = fast ? smallExpPolynomial(x) : expPolynomial(x);
        result.radius_paired_components++;
        result.radius_paired_bit_mismatches += !same(predicted, lane.R);
      } else {
        const predicted = nativeVectorExpLane(x);
        result.radius_system_exp_tail_components++;
        result.radius_system_exp_tail_bit_mismatches += !same(predicted, lane.R);
        result.radius_system_exp_tail_max_absolute_error = Math.max(result.radius_system_exp_tail_max_absolute_error, Math.abs(predicted - lane.R));
      }
      const ab = recurrenceCoefficients(lane.R, lane.K);
      result.AB_components += 2;
      result.AB_bit_mismatches += !same(ab.A, lane.A) + !same(ab.B, lane.B);
    }
  }
  result.checks.push({ stage: record.stage, normalization,
                       actual_normalization: c['0x7e8'], normalization_equal: same(normalization, c['0x7e8']) });
}
result.exact_stages_passed = result.decay_using_captured_normalization_mismatches === 0 &&
  result.radius_paired_bit_mismatches === 0 && result.AB_bit_mismatches === 0;
result.entire_coefficient_chain_bit_exact = result.exact_stages_passed &&
  result.normalization_bit_mismatches === 0 && result.radius_system_exp_tail_bit_mismatches === 0;
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, checks: undefined }, null, 2));
process.exitCode = result.exact_stages_passed ? 0 : 1;
