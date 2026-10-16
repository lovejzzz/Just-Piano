import fs from 'node:fs';
import { postExcitationTables } from '../dsp/post-excitation.mjs';
const [beforePath, afterPath, reportPath] = process.argv.slice(2);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const before = read(beforePath), after = read(afterPath);
if (before.schema !== 1 || after.schema !== 1 || before.point !== '0x100716588' || after.point !== '0x10071658c' ||
    before.stage !== 'before' || after.stage !== 'after' || before.errors.length || after.errors.length ||
    !before.records.length || before.records.length > 16 || before.records.length !== after.records.length)
  throw new Error('Complete matching before/after captures required');
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
const checks = [], failures = [], predictions = [];
function compare(name, predicted, actual) {
  if (predicted.length !== actual.length || !Array.from(actual).every(Number.isFinite)) throw new Error(`Incomplete ${name}`);
  let mismatches = 0;
  predicted.forEach((x, i) => {
    if (bits(x) !== bits(actual[i])) {
      mismatches++;
      if (failures.length < 30) failures.push({ name, index: i, predicted: x, actual: actual[i] });
    }
  });
  checks.push({ name, count: predicted.length, mismatches });
}
for (const [index, a] of before.records.entries()) {
  const b = after.records[index];
  if (a.note !== b.note || a.noteIndex !== b.noteIndex || a.hostCount !== b.hostCount ||
      a.header[2] || a.header[3] || a.header[0] * a.header[1] !== a.size ||
      JSON.stringify(a.curves) !== JSON.stringify(b.curves) || JSON.stringify(a.G) !== JSON.stringify(b.G) ||
      JSON.stringify(a.shared) !== JSON.stringify(b.shared) || JSON.stringify(a.combinationRows) !== JSON.stringify(b.combinationRows))
    throw new Error('Source mode or controls changed across capture');
  const p = postExcitationTables({ source: a.source, amplitudeStorage: a.amplitudeStorage, columns: a.header[0],
    combinationRows: a.combinationRows, combinationCount: a.combinationCount, combinationStart: a.combinationStart,
    weightCurve: a.curves['0x1028'], decayCurve: a.curves['0x1078'], velocity: a.host['0x78'], hostCount: a.hostCount,
    combinationCutoff: a.shared['0x158'], velocityGainDb: a.G['0x10cc'], combinationGain: a.G['0x10c8'],
    amplitudeGain: a.shared['0x88'], dampingBlend: a.shared['0x164'], quadraticBlend: a.shared['0x160'],
    spreadControl: a.G['0x1e8'], quadraticDecay: a.shared['0x15c'], noteIndex: a.noteIndex,
    expression: a.host['0x2fe8'], spreadVariationEnabled: Boolean(a.spreadVariation.enabled) }, { pow: Math.pow });
  for (const key of ['frequency', 'decay', 'amplitude', 'phase']) compare(`${index}-${key}`, p.source[key], b.source[key]);
  const header = [...a.header]; header[1] = p.rows; header[6] = a.header[1]; header[7] = p.rows;
  compare(`${index}-header`, header, b.header);
  compare(`${index}-feedback`, [p.feedbackGain, p.feedbackDecay], [b.host['0x29f8'], b.host['0x29fc']]);
  predictions.push({ note: a.note, header, ...p });
}
const report = { schema: 'pianoteq-post-excitation-pass24', passed: checks.every(x => !x.mismatches),
  comparedValues: checks.reduce((n, x) => n + x.count, 0), mismatches: checks.reduce((n, x) => n + x.mismatches, 0),
  checks, failures, predictions, inputExcitationTablesStillCaptured: true, runtimeControlsAndCurvesStillCaptured: true,
  nativeMathOracleRequired: false, browserPowVerifiedOnlyThroughObservedFloatOutputs: true,
  fullPostExcitationSourceChainVerified: false, wholeVoiceAudioVerified: false };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, predictions: undefined }, null, 2));
if (!report.passed) process.exitCode = 1;
