// Calculated voice-delay output -> release source -> designed filter -> oscillator -> primary.
import fs from 'node:fs';
import { generateReleaseInjection, modulateReleaseInjection, addReleaseInjection, initializeReleaseSource } from '../dsp/release-injection.mjs';
import { initializeReleaseFilters } from '../dsp/release-filter-design.mjs';
import { renderVectorFilter } from '../dsp/vector-filter.mjs';
import { scaleVoiceGroups } from '../dsp/voice-output-delay.mjs';
const [capturePath, reportPath, option, sourcePath, ...extra] = process.argv.slice(2);
const optional = new Map();
if (extra.length % 2) throw new Error('Optional inputs must be name/path pairs');
for (let i=0; i<extra.length; i+=2) {
  if (!['--consumer-capture','--setup-capture'].includes(extra[i]) || optional.has(extra[i])) throw new Error('Invalid optional input');
  optional.set(extra[i], extra[i+1]);
}
if (!capturePath || !reportPath || option !== '--source-report' || !sourcePath) {
  throw new Error('Usage: capture.json report.json --source-report calculated-consumer-delay.json');
}
const consumerPath = optional.get('--consumer-capture');
const setupPath = optional.get('--setup-capture');
const data = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (data.schema !== 1 || !data.windowComplete || data.errors.length ||
    !source.passed || source.mismatches || source.mode !== 'delay' || !source.delayStateSeededOnce) {
  throw new Error('Complete capture and verified calculated delay required');
}
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0, x); return view.getUint32(0); };
const fromBits = x => { view.setUint32(0, x); return view.getFloat32(0); };
const checks = [], failures = [], predictions = [];
function check(name, prediction, actual) {
  if (prediction.length !== actual.length) throw new Error(`Incomplete ${name}`);
  let bad = 0;
  for (let i = 0; i < prediction.length; i++) {
    if (!Number.isFinite(prediction[i]) || !Number.isFinite(actual[i])) throw new Error(`Nonfinite ${name}`);
    if (bits(prediction[i]) !== bits(actual[i])) {
      bad++;
      if (failures.length < 40) failures.push({ name, index: i, predicted: prediction[i], actual: actual[i] });
    }
  }
  checks.push({ name, count: prediction.length, mismatches: bad });
}
const blocks = new Map();
for (const r of data.records) {
  if (!blocks.has(r.ordinal)) blocks.set(r.ordinal, new Map());
  const block = blocks.get(r.ordinal);
  if (block.has(r.stage)) throw new Error('Duplicate injection stage');
  block.set(r.stage, r);
  if (r.primary.rows !== 1 || r.primary.samples !== 64 || r.primary.values.length !== 64) throw new Error('Invalid primary matrix');
}
if (blocks.size !== data.ordinalLimit || new Set(data.records.map(r => r.E)).size !== 1) throw new Error('Incomplete/ambiguous injection voice');
const sourcePrimary = new Map();
for (const r of source.predictions) if (r.group === 0) {
  if (sourcePrimary.has(r.ordinal)) throw new Error('Duplicate calculated input');
  sourcePrimary.set(r.ordinal, r.output);
}
const initial = blocks.get(0)?.get('entry');
if (!initial) throw new Error('Missing initial injection entry');
const c = initial.state;
let state = { amplitude: c['0x0'], shape: c['0x4'], position: c['0x8'], maxStep: c['0xc'],
  real: c['0x38'], imaginary: c['0x3c'], cosine: c['0x40'], sine: c['0x44'], lastMagnitude: c['0x48'] };
if (setupPath) {
  const setup = JSON.parse(fs.readFileSync(setupPath,'utf8'));
  if (!setup.windowComplete || setup.errors.length || setup.records.length !== 3 ||
      setup.records.some((r,i) => r.stage !== ['entry','decibels','oscillator'][i])) throw new Error('Incomplete source setup');
  const seed = setup.records[0], result = setup.records[2], g = seed.global;
  if (seed.curveMode !== 0 || seed.flags['0x18'] === 1 || seed.flags['0x1a'] & 1 ||
      seed.flags['0x1d'] & 1 || seed.flags['0x1e'] & 1 || seed.modelMode === 2) throw new Error('Unverified source-setup correction branch');
  const decibels = Math.max(-100,Math.min(seed.curveValue,24));
  check('setupConstantCurve',[decibels],[setup.records[1].decibels]);
  state = initializeReleaseSource({amplitude:g['0xfc4'],shape:g['0xfc8'],sampleRate:g['0x98'],
    timeScale:g['0xe48'],frequency:g['0x78'],decibels});
  check('sourceSetup',[state.amplitude,state.shape,state.position,state.maxStep,state.real,state.imaginary,state.lastMagnitude,state.cosine,state.sine],
    [result.state['0x0'],result.state['0x4'],result.state['0x8'],result.state['0xc'],result.state['0x38'],result.state['0x3c'],result.state['0x48'],result.cosine,result.sine]);
}
if (initial.filterChannels.length !== 1 || initial.filterFast !== 1) throw new Error('Unverified filter configuration');
const filterControl = initial.filterChannels[0];
const controls = [];
for (let i = 0; i < filterControl.sections; i++) {
  const w = filterControl.controls.slice(i * 15, i * 15 + 15);
  if (w[4] || w[8] || w[12]) throw new Error('Live filter-control smoothing unimplemented');
  controls.push({ type: w[0], frequency: fromBits(w[1]), q: fromBits(w[5]), decibels: fromBits(w[9]) });
}
const sampleRate = fromBits(initial.filterWords[0] >>> 0);
const channelGainWords = filterControl.channelGainWords;
if (channelGainWords[3]) throw new Error('Live channel gain smoothing unimplemented');
const filters = initializeReleaseFilters(controls, sampleRate, fromBits(channelGainWords[0]));
check('initialZeroFilterHistory', filters.history, filterControl.history);
let generatedBlocks = 0, skippedBlocks = 0, changedPrimarySamples = 0, recordIndex = 0;
for (let ordinal = 0; ordinal < data.ordinalLimit; ordinal++) {
  const block = blocks.get(ordinal), entry = block?.get('entry');
  if (!entry || data.records[recordIndex++] !== entry || !sourcePrimary.has(ordinal)) throw new Error('Missing/reordered source entry');
  const input = sourcePrimary.get(ordinal);
  check(`${ordinal}:calculatedInput`, input, entry.primary.values);
  check(`${ordinal}:entryState`, [state.position, state.real, state.imaginary, state.lastMagnitude],
    [entry.state['0x8'], entry.state['0x38'], entry.state['0x3c'], entry.state['0x48']]);
  for (const [field, property] of [['0x0','amplitude'],['0x4','shape'],['0xc','maxStep'],['0x40','cosine'],['0x44','sine']]) {
    if (state[property] !== entry.state[field]) throw new Error('Injection configuration changed');
  }
  const result = generateReleaseInjection(input, entry.target, state);
  if (result.skipped) {
    if (block.size !== 1) throw new Error('Skipped source has native generated stages');
    skippedBlocks++;
    predictions.push({ ordinal, primary: [...input], skipped: true });
    continue;
  }
  if (block.size !== 4) throw new Error('Missing active injection stages');
  const stages = ['generated','filtered','mixed'];
  for (const stage of stages) if (data.records[recordIndex++] !== block.get(stage)) throw new Error('Reordered active stage');
  const generated = block.get('generated'), filtered = block.get('filtered'), mixed = block.get('mixed');
  check(`${ordinal}:generated`, result.generated, generated.scratch.values);
  check(`${ordinal}:position`, [state.position], [generated.state['0x8']]);
  const fc = filtered.filterChannels[0];
  check(`${ordinal}:designedCoefficients`, filters.sections.flatMap(s => [...s.coefficients]), fc.coefficients);
  check(`${ordinal}:designedTable`, filters.table, fc.table);
  check(`${ordinal}:sectionGains`, filters.sections.map(s => s.gain),
    filters.sections.map((_, i) => fromBits(fc.controls[i * 15 + 13])));
  check(`${ordinal}:channelGain`, [filters.totalGain], [fromBits(fc.channelGainWords[4])]);
  const filteredOutput = renderVectorFilter(result.generated, filters.table, filters.history);
  check(`${ordinal}:filtered`, filteredOutput, filtered.scratch.values);
  check(`${ordinal}:filterHistory`, filters.history, fc.history);
  const injection = modulateReleaseInjection(filteredOutput, state);
  check(`${ordinal}:modulated`, injection, mixed.scratch.values);
  check(`${ordinal}:oscillator`, [state.real, state.imaginary], [mixed.state['0x38'],mixed.state['0x3c']]);
  const primary = addReleaseInjection(input, injection);
  check(`${ordinal}:mixed`, primary, mixed.primary.values);
  state.lastMagnitude = Math.max(0, ...injection.map(v => Math.abs(v)));
  changedPrimarySamples += primary.reduce((n, v, i) => n + (bits(v) !== bits(input[i])), 0);
  generatedBlocks++;
  predictions.push({ ordinal, primary: [...primary], skipped: false });
}
if (recordIndex !== data.records.length || sourcePrimary.size !== blocks.size) throw new Error('Incomplete source or stage coverage');
let consumerChainVerified = false;
if (consumerPath) {
  const consumer = JSON.parse(fs.readFileSync(consumerPath, 'utf8'));
  if (consumer.schema !== 1 || !consumer.windowComplete || consumer.errors.length ||
      consumer.records.length !== data.ordinalLimit * 4) throw new Error('Incomplete terminal consumer capture');
  const allDelayGroups = new Map();
  for (const r of source.predictions) {
    if (!allDelayGroups.has(r.ordinal)) allDelayGroups.set(r.ordinal, []);
    const groups = allDelayGroups.get(r.ordinal);
    if (groups[r.group]) throw new Error('Duplicate delay group');
    groups[r.group] = r.output;
  }
  const initialControls = consumer.records[1].controls;
  for (let ordinal = 0; ordinal < data.ordinalLimit; ordinal++) {
    const block = consumer.records.slice(ordinal * 4, ordinal * 4 + 4);
    if (block.some((r,i) => r.ordinal !== ordinal || r.stage !== ['queued','cross','gain','final'][i] ||
        r.groups.length !== 3)) throw new Error('Invalid terminal consumer chronology');
    const groups = allDelayGroups.get(ordinal);
    if (groups.length !== 3 || groups.some(g => !g)) throw new Error('Missing calculated delay group');
    const combined = [predictions[ordinal].primary, groups[1], groups[2]];
    const c = block[1].controls;
    if (c['0x9c'] !== initialControls['0x9c'] || c['0xa0'] !== initialControls['0xa0']) {
      throw new Error('Unverified changing terminal level');
    }
    const scaled = scaleVoiceGroups(combined, initialControls['0x9c'], initialControls['0xa0']);
    for (let g = 0; g < 3; g++) {
      check(`${ordinal}:${g}:completeConsumerBeforeGain`, combined[g], block[1].groups[g].values);
      check(`${ordinal}:${g}:completeConsumerGain`, scaled[g], block[2].groups[g].values);
      check(`${ordinal}:${g}:completeConsumerFinal`, scaled[g], block[3].groups[g].values);
    }
  }
  consumerChainVerified = true;
}
const count = checks.reduce((n,c) => n+c.count, 0), mismatches = checks.reduce((n,c) => n+c.mismatches, 0);
const report = { passed: mismatches === 0, count, matched: count-mismatches, mismatches, windowComplete:true,
  blocks:blocks.size, generatedBlocks, skippedBlocks, changedPrimarySamples,
  calculatedDelayInput:true, initialInjectionStateReadOnce:!setupPath, sourceSetupComputed:!!setupPath, globalSourceControlsStillCaptured:true, filterHistoryStartsAtZero:true,
  filterCoefficientsComputed:true, filterTableComputed:true, filterControlsReadOnce:true,
  releaseTargetsStillObserved:true, upstreamFromSeparateVerifiedRun:true,
  observedConsumerWindowChainVerified:consumerChainVerified,
  completeVoiceOrBrowserEquivalence:false, finalStereoAudioVerified:false, predictions, checks, failures };
fs.writeFileSync(reportPath, JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,predictions:undefined,checks:undefined,failures:undefined}));
if (!report.passed) process.exitCode=1;
