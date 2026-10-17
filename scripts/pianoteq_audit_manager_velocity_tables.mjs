// Historical boundary comparison, not a new native capture or end-to-end audit.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {buildManagerEventTables, managerEventCurvesFromArchive} from '../dsp/manager-event-tables.mjs';
import {ExcitationManagerRandom} from '../dsp/excitation-manager-random.mjs';
import {mapManagerEventValue, randomizeManagerEventValue} from '../dsp/manager-event-velocity.mjs';

const [basePath, presetPath, boundaryPath, outputPath] = process.argv.slice(2);
if (!outputPath || process.argv.length !== 6)
  throw new Error('Usage: node script base-banks.json preset.json pass144-boundary.json NEW-report.json');
const read = path => {
  const bytes = fs.readFileSync(path);
  return {data: JSON.parse(bytes), sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
};
const bank = read(basePath), preset = read(presetPath), boundary = read(boundaryPath);
if (boundary.data.checks?.length !== 5 || boundary.data.passed !== false)
  throw new Error('Expected preserved five-strike failed boundary evidence');
const controls = managerEventCurvesFromArchive({
  baseFields: bank.data[0].fields, presetFields: preset.data.decoded_tail.fields,
});
const generate = (controls, targets) => {
  const tables = buildManagerEventTables({...controls, useGlobal: false, runtimeMode: 'linear-clamp'});
  const manager = new ExcitationManagerRandom({configurationSeed:0, eventBranch:'velocity-randomization-enabled'});
  const checks = targets.map((row, epoch) => {
    if (row.epoch !== epoch || row.midi?.note !== 69 || row.midi.velocity !== 96)
      throw new Error('This historical audit requires five A4 velocity-96 events');
    const {velocityWord} = manager.nextVoice();
    const raw = Math.fround(row.midi.velocity / 128);
    const randomized = randomizeManagerEventValue(raw, velocityWord, {kind:0, eligible:true});
    const prediction = mapManagerEventValue(randomized, {kind:0, table:tables.noteOn});
    return {epoch, raw, velocityWord, randomized, prediction, actual:row.actual,
      bitEqual:Object.is(prediction, row.actual)};
  });
  return {tables, checks};
};
const {tables, checks} = generate(controls, boundary.data.checks);
const changedTargets = boundary.data.checks.map(row => ({...row, actual:0}));
const targetNegative = generate(controls, changedTargets);
const changedControls = structuredClone(controls);
changedControls.base.noteOn.y = changedControls.base.noteOn.y.map(v => Math.fround(v * 0.9));
const sourceNegative = generate(changedControls, boundary.data.checks);
const guards = {
  changedTargetsDoNotChangePredictions: targetNegative.checks.every((c,i) => Object.is(c.prediction, checks[i].prediction)),
  changedTargetsAreRejected: targetNegative.checks.every(c => !c.bitEqual),
  changedSourceChangesPredictions: sourceNegative.checks.every((c,i) => !Object.is(c.prediction, checks[i].prediction)),
  changedSourceIsRejected: sourceNegative.checks.every(c => !c.bitEqual),
};
const report = {
  passed: checks.every(c => c.bitEqual) && Object.values(guards).every(Boolean),
  scope:'Five historical note-on velocity boundaries under explicit runtime assumptions',
  inputSha256:{bank:bank.sha256, preset:preset.sha256, boundary:boundary.sha256},
  captureSha256:boundary.data.captureSha256, midiSha256:boundary.data.midiSha256,
  assumptions:{bankIndex:0, midiNormalization:'velocity/128', configurationSeed:0,
    kind:0, randomizationEligible:true, useGlobal:false, runtimeMode:'linear-clamp',
    postLookupShaping:'zero for decoded preset at note 69; not newly observed'},
  checks, guards, predictedTables:tables,
  newNativeCapture:false, runtimeTablesDirectlyCompared:false,
  substitutedIntoVoice:false, finalStereoVerified:false,
};
fs.writeFileSync(outputPath, JSON.stringify(report,null,2)+'\n', {flag:'wx'});
console.log(JSON.stringify({passed:report.passed, matched:checks.filter(c=>c.bitEqual).length, guards}));
if (!report.passed) process.exitCode=1;
