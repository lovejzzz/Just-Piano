#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {archiveModalDampingControls} from '../dsp/archive-modal-damping.mjs';
const [sourceFile,directory,...extra]=process.argv.slice(2);
if(!sourceFile||!directory||extra.length)throw new Error('Usage: private-archive-inputs.json private-capture-directory');
const sourceBytes=fs.readFileSync(sourceFile),source=JSON.parse(sourceBytes),runtimeBytes=fs.readFileSync(path.join(directory,'runtime.json')),d=JSON.parse(runtimeBytes),launch=JSON.parse(fs.readFileSync(path.join(directory,'launch.json')));
const logBytes=fs.readFileSync(path.join(directory,'lldb.log')),log=logBytes.toString('utf8');
if(/could not read|corrupt (?:FXP file|archive)/i.test(log))throw new Error('Native preset load failed; emitted audio is not evidence for requested preset');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(source.schema!=='pianoteq-archive-damping-inputs-v1'||source.presetSha256!==launch.presetSha256||sha(fs.readFileSync(source.presetPath))!==source.presetSha256)throw new Error('Bound archive-only damping inputs required');
if(!d.runStatus?.terminal||d.runStatus.exitStatus!==0||d.errors?.length||d.dampingProducerErrors?.length||!d.dampingProducerRecords?.length)throw new Error('Complete error-free native damping capture required');
const failures=[],predictions=[];let comparedValues=0;
function check(name,predicted,actual){if(!Number.isFinite(predicted)||!Number.isFinite(actual))throw new Error('Finite damping comparison required');comparedValues++;if(!Object.is(predicted,actual))failures.push({name,predicted,actual});}
for(const [index,r] of d.dampingProducerRecords.entries()){
 if(r.note!==source.note||r.positionRoute!==0)throw new Error('Explicit note and initialized primary position branch required');
 const own=archiveModalDampingControls(source),values={position:own.position,rolloff:own.rolloff,...own.release};
 for(const stage of ['source','actual'])for(const [name,value] of Object.entries(values))check(`${index}:${stage}:${name}`,value,r[stage][name]);
 check(`${index}:host-position`,own.position,r.hostPosition);predictions.push({index,...own});
}
console.log(JSON.stringify({passed:!failures.length,records:d.dampingProducerRecords.length,comparedValues,mismatches:failures.length,failures,predictions,
 sourceSha256:sha(sourceBytes),captureSha256:sha(runtimeBytes),nativeLogSha256:sha(logBytes),nativePresetLoadErrorsAbsent:true,nativePositionRolloffAndGainsUsedForPrediction:false,positionRuntimeExplicit:true,completeVoiceVerified:false,finalStereoAudioVerified:false},null,2));
if(failures.length)process.exitCode=1;
