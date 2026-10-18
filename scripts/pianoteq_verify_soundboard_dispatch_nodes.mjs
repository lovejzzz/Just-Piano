#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: private-dispatch-node-capture');
const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json')));
if (!runtime.runStatus?.terminal || runtime.runStatus.exitStatus !== 0 || runtime.errors?.length || runtime.dispatchErrors?.length ||
    Object.keys(runtime.dispatchPending ?? {}).length || runtime.dispatchRecords?.length !== 3 ||
    runtime.nodeRecord?.visibleNodes !== 9 || runtime.nodeRecord.targets?.length !== 9) {
  throw new Error('Complete three-dispatch/nine-node capture required');
}
function read(descriptor) {
  if (!descriptor || path.basename(descriptor.file) !== descriptor.file) throw new Error('Invalid descriptor');
  const bytes = fs.readFileSync(path.join(directory, descriptor.file));
  if (bytes.length !== descriptor.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256) {
    throw new Error('Descriptor differs');
  }
  return bytes;
}
const source = runtime.dispatchRecords.flatMap((record, index) => {
  if (record.number !== index || record.outputs?.length !== 3) throw new Error('Dispatcher order/count differs');
  return record.outputs.map((output, channel) => ({dispatch: index, channel, output}));
});
const comparisons = runtime.nodeRecord.targets.map((target, node) => {
  const {dispatch, channel, output} = source[node];
  const actual = read(output.data), expected = read(target.data);
  if (target.index !== node || target.length !== output.length || actual.length !== expected.length ||
      actual.length !== target.length * 4) throw new Error('Node shape differs');
  let mismatches = 0;
  for (let i = 0; i < actual.length; i += 4) {
    if (!Number.isFinite(actual.readFloatLE(i)) || !Number.isFinite(expected.readFloatLE(i))) throw new Error('Non-finite node');
    if (actual.readUInt32LE(i) !== expected.readUInt32LE(i)) mismatches++;
  }
  return {node, dispatch, channel, compared: target.length, mismatches};
});
const passed = comparisons.every((v) => !v.mismatches);
console.log(JSON.stringify({passed, comparisons, nodeBindingVerified: passed,
  dispatcherOutputsStillCaptured: true, fullIrNodesGenerated: false}, null, 2));
if (!passed) process.exitCode = 1;
