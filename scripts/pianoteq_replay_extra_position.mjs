#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {archiveModalDampingControls} from '../dsp/archive-modal-damping.mjs';
import {modalPositionWeights} from '../dsp/modal-position-weights.mjs';
const [sourceFile,directory,...extra]=process.argv.slice(2);
if(!sourceFile||!directory||extra.length)throw new Error('Usage: private-archive-inputs.json private-capture-directory');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceBytes=fs.readFileSync(sourceFile),source=JSON.parse(sourceBytes),runtimeBytes=fs.readFileSync(path.join(directory,'runtime.json')),d=JSON.parse(runtimeBytes),launch=JSON.parse(fs.readFileSync(path.join(directory,'launch.json'))),log=fs.readFileSync(path.join(directory,'lldb.log'));
if(source.schema!=='pianoteq-archive-damping-inputs-v1'||source.presetSha256!==launch.presetSha256||sha(fs.readFileSync(source.presetPath))!==source.presetSha256)throw new Error('Bound archive damping source required');
if(/could not read|corrupt (?:FXP file|archive)/i.test(log.toString()))throw new Error('Native preset load failed');
if(!d.runStatus?.terminal||d.runStatus.exitStatus!==0||d.errors?.length||d.positionErrors?.length||d.positionPending!==0||!d.positionRecords?.length)throw new Error('Complete error-free extra position capture required');
const controls=archiveModalDampingControls(source),failures=[],predictionHashes=[];let comparedValues=0;
function check(name,own,target){comparedValues++;if(!Number.isFinite(own)||!Number.isFinite(target)||!Object.is(own,target))failures.push({name,own,target});}
for(const [i,r] of d.positionRecords.entries()){
 check(`${i}:position`,controls.position,r.position);check(`${i}:rolloff`,controls.rolloff,r.rolloff);
 for(const key of ['x','y']){
  if(controls.extraCurve[key].length!==r.extraCurve[key].length)throw new Error('Native/archive curve size differs');
  controls.extraCurve[key].forEach((v,j)=>check(`${i}:curve-${key}-${j}`,Math.fround(v),r.extraCurve[key][j]));
 }
 const own=modalPositionWeights({...r,position:controls.position,rolloff:controls.rolloff,extraCurve:controls.extraCurve});
 predictionHashes.push(sha(Buffer.from(own.buffer,own.byteOffset,own.byteLength)));
 if(own.length!==r.actual.length)throw new Error('Weight storage size differs');
 own.forEach((v,j)=>check(`${i}:weight-${j}`,v,r.actual[j]));
}
console.log(JSON.stringify({passed:!failures.length,records:d.positionRecords.length,comparedValues,mismatches:failures.length,failures,predictionHashes,sourceSha256:sha(sourceBytes),captureSha256:sha(runtimeBytes),nativeLogSha256:sha(log),positionRolloffAndExtraCurveFromArchive:true,nativeFrequencyLayoutAndReferenceStillObserved:true,finalStereoAudioVerified:false},null,2));
if(failures.length)process.exitCode=1;
