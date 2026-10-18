// Separate oracle comparison; the numerical generator never imports this file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [generatedDirectory, archiveFile, nativeDirectory, output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw new Error('Usage: generated-directory archive-json native-directory fresh-report');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const archiveBytes = fs.readFileSync(archiveFile), archive = JSON.parse(archiveBytes);
const manifestBytes = fs.readFileSync(path.join(generatedDirectory, 'manifest.json')), own = JSON.parse(manifestBytes);
const captureBytes = fs.readFileSync(path.join(nativeDirectory, 'runtime.json')), native = JSON.parse(captureBytes);
const launchBytes = fs.readFileSync(path.join(nativeDirectory, 'launch.json')), launch = JSON.parse(launchBytes);
const log = fs.readFileSync(path.join(nativeDirectory, 'lldb.log'));
const components = archive.soundboards?.filters?.length;
if (own.schema !== 1 || own.sourceArchiveSha256 !== sha(archiveBytes) || own.numericalInputFileCount !== 1 ||
    own.nativeCapturesUsedForPrediction !== false || own.nativeTargetBuffersUsedForPrediction !== false ||
    !Number.isInteger(components) || components < 1 || components > 64 ||
    own.groups?.length !== components || native.dispatchRecords?.length !== components || native.targetMutation !== false ||
    native.hardwareBreakpoints !== 1 || native.runStatus?.terminal !== true || native.runStatus.exitStatus !== 0 ||
    !Array.isArray(native.errors) || native.errors.length || !Array.isArray(native.tripletErrors) || native.tripletErrors.length ||
    /could not read|corrupt (?:FXP file|archive)|marap_oo\.hh|Traceback/i.test(log.toString()))
  throw new Error('Complete independent generation and terminal error-free read-only oracle required');
function argument(name) {
  if (launch.arguments?.filter(x => x === name).length !== 1) throw new Error('Unique native argument required: ' + name);
  return launch.arguments[launch.arguments.indexOf(name) + 1];
}
const factoryPreset = archive.sources?.factoryPreset;
if (factoryPreset) {
  if (argument('--preset') !== factoryPreset.name || launch.factoryPreset !== factoryPreset.name ||
      launch.arguments.includes('--fxp') || launch.factoryStateSha256 !== factoryPreset.stateSha256 ||
      !/^[a-f0-9]{64}$/.test(factoryPreset.stateSha256) ||
      sha(fs.readFileSync(launch.resourcePath)) !== archive.sources.resourceSha256 ||
      archive.sources.resourceSha256 !== 'd8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d')
    throw new Error('Factory name, complete state digest and native resource binding required');
} else if (argument('--fxp') !== launch.presetPath || sha(fs.readFileSync(launch.presetPath)) !== launch.presetSha256 ||
    archive.sources?.presetSha256 !== launch.presetSha256 || launch.arguments.includes('--preset'))
  throw new Error('Matching native FXP required');
if (Number(argument('--rate')) !== archive.runtimeRates?.renderRate ||
    argument('--multicore') !== '0' || !launch.arguments.includes('--no-prefs'))
  throw new Error('Preset and render context must bind the generator to this native oracle');
const channels = archive.microphones?.output?.records?.filter(r => r.type === 1).length;
if (!Number.isInteger(channels) || channels < 1 || channels > 64)
  throw new Error('Explicit ordinary channel count required');
function read(directory, descriptor) {
  if (!descriptor || path.basename(descriptor.file) !== descriptor.file) throw new Error('Invalid response descriptor');
  const bytes = fs.readFileSync(path.join(directory, descriptor.file));
  if (bytes.length !== descriptor.bytes || bytes.length % 4 || sha(bytes) !== descriptor.sha256)
    throw new Error('Complete response payload and digest required');
  for (let i = 0; i < bytes.length; i += 4)
    if (!Number.isFinite(bytes.readFloatLE(i))) throw new Error('Finite response required');
  return bytes;
}
const comparisons = own.groups.flatMap((group, i) => {
  const target = native.dispatchRecords[i];
  if (group.component !== i || target.number !== i || group.responses?.length !== channels || target.outputs?.length !== channels ||
      group.normalizations?.length !== channels) throw new Error('All chronological source-group/channel responses required');
  return group.responses.map((response, channel) => {
    const actual = target.outputs[channel], a = read(generatedDirectory, response), b = read(nativeDirectory, actual.data);
    if (a.length !== response.length * 4 || b.length !== actual.length * 4)
      throw new Error('Response shape metadata differs');
    let mismatches = Math.abs(a.length - b.length) / 4;
    for (let j = 0; j < Math.min(a.length, b.length); j += 4)
      mismatches += Number(a.readUInt32LE(j) !== b.readUInt32LE(j));
    const word = Buffer.alloc(4), normalization = group.normalizations[channel];
    if (!Number.isFinite(normalization) || !(normalization > 0) || !Number.isInteger(actual.normalizationBits) ||
        actual.normalizationBits < 0 || actual.normalizationBits > 0xffffffff || !Number.isFinite(target.outputRate))
      throw new Error('Finite normalization and output rate required');
    word.writeFloatLE(normalization);
    return {group: i, channel, generatedValues: response.length, nativeValues: actual.length, mismatches,
      normalizationMatches: word.readUInt32LE() === actual.normalizationBits,
      outputRateMatches: Object.is(group.outputRate, target.outputRate), generatedSha256: sha(a), nativeSha256: sha(b)};
  });
});
const passed = comparisons.every(c => !c.mismatches && c.normalizationMatches && c.outputRateMatches);
const result = {schema: 'pianoteq-generated-soundboard-triplets-v2', passed, channels, components,
  values: comparisons.reduce((sum, c) => sum + c.generatedValues, 0), comparisons,
  sourceArchiveSha256: sha(archiveBytes), generatedManifestSha256: sha(manifestBytes), nativeCaptureSha256: sha(captureBytes),
  launchSha256: sha(launchBytes), nativeLogSha256: sha(log),
  nativeCapturesUsedForPrediction: false, nativeBoundary: 'completed-dispatch-groups',
  modelNodeOwnershipVerifiedHere: false, allModelFamiliesAndConfigurationsVerified: false,
  completeVoiceVerified: false, finalStereoAudioVerified: false};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify(result));
if (!passed) process.exitCode = 1;
