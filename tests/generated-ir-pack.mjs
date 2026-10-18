// Synthetic provenance/serialization controls; authentic sound validation is separate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-ir-pack-'));
const generated = path.join(temporary, 'generated'); fs.mkdirSync(generated);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const exporter = fileURLToPath(new URL('../scripts/pianoteq_export_generated_ir_pack.mjs', import.meta.url));
try {
  const archive = Buffer.from(JSON.stringify({runtimeRates: {renderRate: 48000},
    sources: {presetSha256: 'a'.repeat(64), resourceSha256: 'b'.repeat(64)}}));
  const archivePath = path.join(temporary, 'archive.json'); fs.writeFileSync(archivePath, archive);
  const groups = Array.from({length: 3}, (_, component) => ({component, outputRate: 48000,
    responses: Array.from({length: 3}, (_, channel) => {
      const length = component === 0 ? 8384 : 7552, file = `${component}-${channel}.bin`, raw = Buffer.alloc(length * 4);
      if (!component && !channel) raw.writeFloatLE(-0, 0);
      fs.writeFileSync(path.join(generated, file), raw);
      return {file, bytes: raw.length, length, sha256: digest(raw)};
    })}));
  const manifest = {schema: 1, nativeCapturesUsedForPrediction: false, nativeTargetBuffersUsedForPrediction: false,
    numericalInputFileCount: 1, sourceArchiveSha256: digest(archive), groups};
  const manifestPath = path.join(generated, 'manifest.json'); fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const run = name => {
    const output = path.join(temporary, name);
    return {output, child: spawnSync(process.execPath, [exporter, generated, archivePath, output], {encoding: 'utf8'})};
  };
  const valid = run('valid.json'); assert.equal(valid.child.status, 0, valid.child.stderr);
  const pack = JSON.parse(fs.readFileSync(valid.output));
  assert.equal(pack.head.length, 144); assert.equal(pack.tail.length, 121);
  assert.equal(Object.is(pack.head.find(e => e.key === '0:15').values[0], -0), true);
  assert.deepEqual(pack.source.nodeLengths, [8384, 8384, 8384, 7552, 7552, 7552, 7552, 7552, 7552]);
  const duplicate = run('valid.json'); assert.notEqual(duplicate.child.status, 0);
  const first = path.join(generated, groups[0].responses[0].file), original = fs.readFileSync(first);
  const altered = Buffer.from(original); altered[0] ^= 1; fs.writeFileSync(first, altered);
  const badPayload = run('bad-payload.json'); assert.notEqual(badPayload.child.status, 0); assert.equal(fs.existsSync(badPayload.output), false);
  fs.writeFileSync(first, original);
  fs.writeFileSync(manifestPath, JSON.stringify({...manifest, nativeCapturesUsedForPrediction: true}));
  const nativeSource = run('bad-source.json'); assert.notEqual(nativeSource.child.status, 0); assert.equal(fs.existsSync(nativeSource.output), false);
  fs.writeFileSync(manifestPath, JSON.stringify({...manifest, sourceArchiveSha256: '0'.repeat(64)}));
  const badArchive = run('bad-archive.json'); assert.notEqual(badArchive.child.status, 0); assert.equal(fs.existsSync(badArchive.output), false);
  console.log('PASS generated IR pack signed zero, payload/manifest binding and private output guards');
} finally {fs.rmSync(temporary, {recursive: true, force: true});}
