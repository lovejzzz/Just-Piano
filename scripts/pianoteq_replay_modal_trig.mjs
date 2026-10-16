// Usage: node SCRIPT initial-runtime.json [report.json]
// No platform math oracle: input and expected output come from the untouched
// target capture; the browser algorithm is translated instruction arithmetic.
import fs from 'node:fs';
import { nativeModalTrig } from '../dsp/native-modal-trig.mjs';
const [capturePath, reportPath] = process.argv.slice(2);
if (!capturePath || process.argv.length > 4) throw new Error('Expected initial modal capture and optional report');
const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
if (capture.schema !== 1 || capture.stage !== 'initial' || capture.point !== '0x1008634d8' || capture.errors?.length || !capture.records?.length)
  throw new Error('Expected complete initial-state schema1 capture at 8634d8');
const view = new DataView(new ArrayBuffer(4));
const bits = value => { view.setFloat32(0, value); return view.getUint32(0).toString(16).padStart(8, '0'); };
const uniqueAngles = new Set(), failures = [], mathematicalDifferences = [], checks = [];
let outputValues = 0;
for (const [recordIndex, record] of capture.records.entries()) {
  for (const name of ['theta', 'phase']) {
    if (record[name]?.length !== 4 || record[`sin_${name}`]?.length !== 4 || record[`cos_${name}`]?.length !== 4)
      throw new Error(`Missing four-lane trig data at record ${recordIndex}`);
    const predicted = nativeModalTrig(record[name]);
    record[name].forEach(value => uniqueAngles.add(bits(value)));
    for (const operation of ['sin', 'cos']) {
      const actual = record[`${operation}_${name}`];
      for (let lane = 0; lane < 4; lane++) {
        outputValues++;
        if (bits(predicted[operation][lane]) !== bits(actual[lane])) failures.push({ record: recordIndex, name, operation, lane,
          angle: record[name][lane], predicted: predicted[operation][lane], actual: actual[lane],
          predictedBits: bits(predicted[operation][lane]), actualBits: bits(actual[lane]) });
        const mathematical = Math.fround(Math[operation](record[name][lane]));
        if (bits(mathematical) !== bits(actual[lane])) mathematicalDifferences.push({ record: recordIndex, name, operation, lane,
          angle: record[name][lane], mathematical, actual: actual[lane], mathematicalBits: bits(mathematical), actualBits: bits(actual[lane]) });
      }
    }
    checks.push({ record: recordIndex, V: record.V, lane: record.lane, name, input: record[name],
      sin: Array.from(predicted.sin), cos: Array.from(predicted.cos) });
  }
}
const report = { schema: 'pianoteq-modal-trig-pass20', capturedInputsStillRequired: true,
  nativeOracleRequired: false, systemTrigUsedByImplementation: false,
  records: capture.records.length, inputVectors: checks.length, uniqueFloatAngles: uniqueAngles.size,
  outputValues, bitMismatches: failures.length, mathematicalTrigMismatches: mathematicalDifferences.length,
  checks, failures, mathematicalDifferences, passed: failures.length === 0 };
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, checks: undefined, mathematicalDifferences: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
