#!/usr/bin/env node
// The generator does not import this verifier and never accepts its oracle path.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [generatedDirectory,nativeDirectory,groupText]=process.argv.slice(2);
if(!generatedDirectory||!nativeDirectory||process.argv.length>5)throw new Error('Usage: generated-private-directory native-capture-directory [single-group-index]');
const own=JSON.parse(fs.readFileSync(path.join(generatedDirectory,'manifest.json')));
if(own.schema!==1||own.nativeCapturesUsedForPrediction!==false||own.nativeTargetBuffersUsedForPrediction!==false||
  own.numericalInputFileCount!==1||!Array.isArray(own.groups)||!own.groups.length)throw new Error('Complete independent generation manifest required');
const native=JSON.parse(fs.readFileSync(path.join(nativeDirectory,'runtime.json')));
if(!native.runStatus?.terminal||native.runStatus.exitStatus!==0||native.errors?.length)throw new Error('Terminal error-free native oracle required');
let entries;
if(groupText===undefined){
  const verified=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('pianoteq_verify_soundboard_dispatch_nodes.mjs',import.meta.url)),nativeDirectory],
    {encoding:'utf8',maxBuffer:4*1024*1024}));
  if(!verified.passed||!native.nodeRecord?.targets?.length)throw new Error('Bound native model-node oracle required');
  let node=0;
  entries=own.groups.flatMap((g,i)=>{if(g.component!==i)throw new Error('Generated component order differs');
    return g.responses.map((response,channel)=>({group:i,channel,response,target:native.nodeRecord.targets[node++],
      normalizationBits:native.dispatchRecords?.[i]?.outputs?.[channel]?.normalizationBits,outputRate:native.dispatchRecords?.[i]?.outputRate}));});
  if(entries.length!==native.nodeRecord.targets.length)throw new Error('Generated/native model-node counts differ');
}else{
  const group=Number(groupText),g=own.groups[group];
  if(!Number.isInteger(group)||group<0||g?.component!==group||(native.selectedDispatch??0)!==group||
    native.resamplingPending||native.dispatchOutputs?.length!==g.responses.length||native.dispatchHeaders?.length!==g.responses.length)
    throw new Error('Complete matching native dispatch group required');
  entries=g.responses.map((response,channel)=>({group,channel,response,outputRate:native.resampling?.[0],
    normalizationBits:native.dispatchHeaders[channel].normalizationValueBits,
    target:{length:native.dispatchHeaders[channel].length,data:native.dispatchOutputs[channel]}}));
}
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function read(directory,d){
  if(!d||path.basename(d.file)!==d.file)throw new Error('Invalid response descriptor');
  const b=fs.readFileSync(path.join(directory,d.file));
  if(b.length!==d.bytes||b.length%4||digest(b)!==d.sha256)throw new Error('Response descriptor differs');
  for(let i=0;i<b.length;i+=4)if(!Number.isFinite(b.readFloatLE(i)))throw new Error('Nonfinite response');
  return b;
}
const comparisons=entries.map(({group,channel,response,target,normalizationBits,outputRate})=>{
  if(!target)throw new Error('Native node missing');
  const a=read(generatedDirectory,response),b=read(nativeDirectory,target.data);
  if(a.length!==response.length*4||b.length!==target.length*4)throw new Error('Response extent metadata differs');
  let mismatches=Math.abs(a.length-b.length)/4;
  for(let i=0;i<Math.min(a.length,b.length);i+=4)mismatches+=Number(a.readUInt32LE(i)!==b.readUInt32LE(i));
  const normalization=own.groups[group].normalizations?.[channel],word=Buffer.alloc(4);
  if(!Number.isFinite(normalization)||!(normalization>0)||!Number.isInteger(normalizationBits)||normalizationBits<0||normalizationBits>0xffffffff||
    !Number.isFinite(outputRate)||!(outputRate>0))throw new Error('Complete finite normalization/rate metadata required');
  word.writeFloatLE(normalization);
  return {group,channel,generatedValues:response.length,nativeValues:target.length,mismatches,
    normalizationMatches:word.readUInt32LE()===normalizationBits,outputRateMatches:Object.is(own.groups[group].outputRate,outputRate),
    generatedSha256:digest(a),nativeSha256:digest(b)};
});
const passed=comparisons.every(c=>!c.mismatches&&c.normalizationMatches&&c.outputRateMatches);
console.log(JSON.stringify({passed,sourceArchiveSha256:own.sourceArchiveSha256,
  values:comparisons.reduce((n,c)=>n+c.generatedValues,0),comparisons,
  nativeCapturesUsedForPrediction:false,supportedProfileArchiveToIrVerified:passed,
  allModelFamiliesAndConfigurationsVerified:false,completeVoiceVerified:false,finalStereoAudioVerified:false},null,2));
if(!passed)process.exitCode=1;
