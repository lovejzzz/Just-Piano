// Package independently generated response nodes; accepts no native capture or IR-copy input.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {soundboardIrSlots} from '../dsp/soundboard-ir-nodes.mjs';
import {readIrPack} from '../dsp/ir-pack.mjs';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';

const [generatedDirectory, archivePath, output] = process.argv.slice(2);
if (!generatedDirectory || !archivePath || !output || process.argv.length !== 5)
  throw new Error('Usage: independent-generated-directory source-archive-json fresh-private-pack');
const repository = fileURLToPath(new URL('../', import.meta.url));
const target = path.resolve(output);
if (fs.existsSync(target) || target.startsWith(repository)) throw new Error('Fresh private pack required');
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const manifestBytes = fs.readFileSync(path.join(generatedDirectory, 'manifest.json')), manifest = JSON.parse(manifestBytes);
const archiveBytes = fs.readFileSync(archivePath), archive = JSON.parse(archiveBytes);
if (manifest.schema !== 1 || manifest.nativeCapturesUsedForPrediction !== false || manifest.nativeTargetBuffersUsedForPrediction !== false ||
    manifest.numericalInputFileCount !== 1 || manifest.sourceArchiveSha256 !== digest(archiveBytes) || manifest.groups.length !== 3 ||
    archive.runtimeRates.renderRate !== 48000) throw new Error('Bound independent 48kHz archive generation required');
const nodeDigests = [], nodes = manifest.groups.flatMap((group, component) => {
  if (group.component !== component || group.responses.length !== 3 || group.outputRate !== 48000)
    throw new Error('Ordered three-by-three generated responses required');
  return group.responses.map(descriptor => {
    if (path.basename(descriptor.file) !== descriptor.file) throw new Error('Local generated descriptor required');
    const raw = fs.readFileSync(path.join(generatedDirectory, descriptor.file));
    if (raw.length !== descriptor.bytes || raw.length !== descriptor.length * 4 || digest(raw) !== descriptor.sha256)
      throw new Error('Generated payload extent or digest differs');
    nodeDigests.push(descriptor.sha256);
    return Float32Array.from({length: descriptor.length}, (_, i) => {
      const value = raw.readFloatLE(i * 4); if (!Number.isFinite(value)) throw new Error('Finite generated IR required'); return value;
    });
  });
});
const slots = soundboardIrSlots(nodes);
const pack = {schema: 1, ...slots, source: {kind: 'independent-archive-generation',
  sourceArchiveSha256: digest(archiveBytes), generatorManifestSha256: digest(manifestBytes), nodeSha256: nodeDigests,
  nodeLengths: nodes.map(node => node.length),
  presetSha256: archive.sources.presetSha256, resourceSha256: archive.sources.resourceSha256,
  nativeCapturesUsedForPrediction: false, numericalInputFileCount: 1}};
readIrPack(pack);
fs.writeFileSync(target, stringifyWithNegativeZero(pack, 0) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({head: pack.head.length, tail: pack.tail.length, nodes: nodes.length,
  sourceArchiveSha256: pack.source.sourceArchiveSha256, packSha256: digest(fs.readFileSync(target)),
  nativeCapturesUsedForPrediction: false}));
