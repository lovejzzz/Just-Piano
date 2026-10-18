// Extract only explicit runtime modes/constants, never source/result tables.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const [configFile, output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw new Error('Usage: private-capture-paths.json fresh-private-runtime-context.json');
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(fs.realpathSync(path.dirname(path.resolve(output))), path.basename(output));
if (destination === repository || destination.startsWith(repository + path.sep)) throw new Error('Private output outside repository required');
const paths = JSON.parse(fs.readFileSync(configFile)), data = {}, sources = {};
const names = ['stretched', 'anchor', 'stretchWeights', 'counts', 'constants', 'weightConstants', 'source', 'grids', 'before', 'radius', 'polynomial'];
for (const key of names) {
  const bytes = fs.readFileSync(paths[key]); data[key] = JSON.parse(bytes);
  if (!data[key].records?.length || data[key].errors?.length) throw new Error('Complete runtime observation required: ' + key);
  sources[key] = {path: path.resolve(paths[key]), sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
}
if (data.source.point !== '0x1007a4784' || data.source.records.length !== 2 || data.before.records.length !== 36)
  throw new Error('Complete explicit A4 two-mode runtime configuration required');
const mode = c => ({flags: c.log_x, special: c.special_mode, dimension: c.dimension});
const ordinary = {flags: 0, special: 0, dimension: 1}, cfg = data.stretched.configurations[0];
const anchor = data.anchor.records[0], weights = data.stretchWeights.records[0], counts = data.counts.records[0];
const constants = data.constants.records[0], weightOffset = data.weightConstants.records[0].weight_offset;
const radius = data.radius.records[0].radius, polynomial = data.polynomial.records[0];
if (data.constants.records.some(r => r.phase_constant !== constants.phase_constant || r.integer_amplitude_scale !== constants.integer_amplitude_scale) ||
    data.weightConstants.records.some(r => r.weight_offset !== weightOffset) || data.radius.records.some(r => r.radius !== radius))
  throw new Error('Stable explicit registry/impedance constants required');
const sourceCurveModes = Object.fromEntries([...Object.entries(cfg.base_curves).map(([k, c]) => ['B' + k.slice(2), mode(c)]),
  ...Object.entries(cfg.preset_curves).map(([k, c]) => ['A' + k.slice(2), mode(c)])]);
const sourceOptions = {};
for (const cacheMode of [0, 1]) {
  const record = data.source.records.find(r => r.mode === cacheMode), grid = data.grids.configurations[`69:${cacheMode}`];
  const before = data.before.records.filter(r => r.note_index === 69 && r.cache_mode === cacheMode);
  if (!record || record.note !== 69 || record.note_index !== 69 || !grid || before.length !== (cacheMode === 0 ? 26 : 10) ||
      before.some(r => JSON.stringify(mode(r.phase_curve)) !== JSON.stringify(mode(before[0].phase_curve))))
    throw new Error('Matching complete runtime mode required');
  const phaseNames = ['globalDegrees', 'evenOffset', 'oddDegrees', 'evenDegrees', 'oddDelay', 'evenDelay'];
  const phaseOffsets = ['0x400', '0x418', '0x430', '0x448', '0x460', '0x478'];
  sourceOptions[cacheMode] = {instrumentMode: 1, phaseCurveMode: ordinary,
    amplitudeCurveModes: Object.fromEntries(['B25b0', 'B26f0', 'B2790', 'A530'].map(k => [k, ordinary])),
    weightSource: {runtimeCurveModes: Object.fromEntries(['B17d8', 'A8a8', 'B1828', 'B1878', 'Ad30', 'B18d0'].map(k => [k, ordinary])),
      harmonicCurveMode: ordinary, weightOffset},
    integerScale: constants.integer_amplitude_scale, phaseConstant: constants.phase_constant, sampleRate: record.G_controls['0x98'],
    sourceRuntimeCurveMode: ordinary, polynomialControls: {kappa: polynomial.kappa, gamma: polynomial.gamma},
    impedanceRuntime: {mode: cacheMode, runtimeCurveMode: 'linear-clamp', phaseCurveMode: mode(before[0].phase_curve),
      frequencyCurveModes: grid.frequency_curves.map(mode), polarRadius: radius},
    phaseOffsetControls: Object.fromEntries(phaseNames.map((name, i) => [name, record.G_controls[phaseOffsets[i]]]))};
}
const runtime = {note: 69, instrumentMode: 1, hostMode: 0, noteBranch: 'ordinary', configurationSeed: 0,
  eventBranch: 'velocity-randomization-enabled', useGlobal: false, midiNormalization: 'velocity/128', kind: 0,
  tuning: {sourceCurveModes, stretchCurveMode: mode(counts.weight_curve), pitchCurveMode: mode(cfg.pitch_edits),
    registry: {middleWeight: weights.middle_weight, gramScale: weights.gram_scale,
      pitchScale: cfg.registry_constants.pitch_scale, referenceNote: cfg.registry_constants.reference_note,
      anchorMultiplier: anchor.registry_multiplier}}, sourceOptions};
fs.writeFileSync(output, JSON.stringify({schema: 'pianoteq-excitation-runtime-context-v1', runtime, sources,
  registryAndCurveModesStillObserved: true, ordinaryScalarModesStillExplicit: true, hostAndInstrumentBranchesStillExplicit: true}, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({runtimeModes: 2, observationFiles: names.length, sourceTablesExported: false}));
