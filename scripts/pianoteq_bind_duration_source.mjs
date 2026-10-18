import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
export function bindDurationSource(bytes) {
  const source = JSON.parse(bytes);
  if (source.schema !== 'pianoteq-duration-archive-inputs-v2' ||
      source.presetSha256 !== sha(fs.readFileSync(source.presetPath)) ||
      source.resourceSha256 !== sha(fs.readFileSync(source.resourcePath)) ||
      source.registryAndCurveModesStillObserved !== true || source.runtimeCurveModeStillAssumed !== true)
    throw new Error('Current bound duration archive source required');
  const contextBytes = fs.readFileSync(source.runtimeContextSource.path), context = JSON.parse(contextBytes);
  if (sha(contextBytes) !== source.runtimeContextSource.sha256 ||
      context.schema !== 'pianoteq-duration-runtime-context-v1' ||
      JSON.stringify(context.runtime) !== JSON.stringify(source.tuningRuntime) ||
      !context.observedSourceHashes || Object.keys(context.observedSourceHashes).length !== 5)
    throw new Error('Exact explicit duration runtime context required');
  for (const [file, digest] of Object.entries(context.observedSourceHashes)) {
    if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') ||
        sha(fs.readFileSync(path.resolve(path.dirname(source.runtimeContextSource.path), file))) !== digest)
      throw new Error('Unchanged duration runtime observation required');
  }
  return source;
}
