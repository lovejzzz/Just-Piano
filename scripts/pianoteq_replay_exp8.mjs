// Direct replay of the internal eight-lane helper's actual input/output pairs.
// Usage: node SCRIPT runtime.json [report.json]
import fs from 'node:fs';
import { expPolynomial } from '../dsp/modal-coefficients.mjs';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!data.records.length || data.errors.length) throw new Error('Missing or failed capture');
const word = new DataView(new ArrayBuffer(4));
const bits = (value) => { word.setFloat32(0, value); return word.getUint32(0); };
let components = 0, mismatches = 0;
for (const record of data.records) {
  if (record.inputs.length !== 8 || record.outputs.length !== 8) throw new Error('Expected eight lanes');
  for (let i = 0; i < 8; i++) {
    components++;
    mismatches += bits(expPolynomial(record.inputs[i])) !== bits(record.outputs[i]);
  }
}
const result = { records: data.records.length, components, bit_mismatches: mismatches, passed: mismatches === 0 };
const text = JSON.stringify(result, null, 2);
if (process.argv[3]) fs.writeFileSync(process.argv[3], text);
console.log(text);
process.exitCode = result.passed ? 0 : 1;
