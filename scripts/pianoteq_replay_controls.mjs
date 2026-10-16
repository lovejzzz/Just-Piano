// Replay actual pass6 hardness and pass7 release snapshots through JS controls.
// Usage: node SCRIPT hardness.json damper.json [report.json]
import fs from 'node:fs';
import { interpolateHardness, releaseCoefficients } from '../dsp/physical-controls.mjs';
const [hardnessPath, releasePath, reportPath] = process.argv.slice(2);
const hardness = JSON.parse(fs.readFileSync(hardnessPath, 'utf8'));
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
if (hardness.errors.length || release.errors.length) throw new Error('Capture contains errors');
const bytes = new DataView(new ArrayBuffer(4));
function same(a, b) {
  bytes.setFloat32(0, a, true);
  const x = bytes.getUint32(0, true);
  bytes.setFloat32(0, b, true);
  return x === bytes.getUint32(0, true);
}
const hardnessChecks = hardness.records.map((r) => same(interpolateHardness(r), r.result));
const releaseChecks = [];
for (const r of release.records.filter((r) => r.kind === 'release_coefficients')) {
  const field = (offset) => r.fields[`0x${offset.toString(16)}`];
  const predicted = releaseCoefficients({ x: field(0x8c4), u: field(0x8cc),
    cubicScale: field(0x91c), polynomial: [0x914, 0x94c, 0x950, 0x954, 0x958].map(field),
    rateScale: field(0x910), gainScale: field(0x90c), cubicGainScale: field(0x920) });
  releaseChecks.push(same(predicted.duration, field(0x944)),
                     same(predicted.rate, field(0x7e4)), same(predicted.gain, field(0x7b0)));
}
if (!hardnessChecks.length || !releaseChecks.length) throw new Error('Missing capture records');
const result = { hardness_components: hardnessChecks.length,
  hardness_bit_mismatches: hardnessChecks.filter((v) => !v).length,
  release_components: releaseChecks.length,
  release_bit_mismatches: releaseChecks.filter((v) => !v).length,
  passed: hardnessChecks.every(Boolean) && releaseChecks.every(Boolean) };
const text = JSON.stringify(result, null, 2);
if (reportPath) fs.writeFileSync(reportPath, text);
console.log(text);
process.exitCode = result.passed ? 0 : 1;
