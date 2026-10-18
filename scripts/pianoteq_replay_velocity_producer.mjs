#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {archiveVelocityProducerControls} from '../dsp/archive-velocity-producer.mjs';
import {archivePitchSourceControls,velocityScaleFromControls} from '../dsp/pitch-source-controls.mjs';
import {nativeScalarLogf} from '../dsp/native-scalar-log.mjs';
import {nativeScalarExp} from '../dsp/native-scalar-exp.mjs';
const [sourceFile,directory,...extra]=process.argv.slice(2);
if(!sourceFile||!directory||extra.length)throw new Error('Usage: private-archive-inputs.json private-capture-directory');
const sourceBytes=fs.readFileSync(sourceFile),source=JSON.parse(sourceBytes),runtimeBytes=fs.readFileSync(path.join(directory,'runtime.json')),d=JSON.parse(runtimeBytes);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const launch=JSON.parse(fs.readFileSync(path.join(directory,'launch.json')));
if(source.schema!=='pianoteq-archive-voice-pitch-inputs-v2'||source.velocityControls!==undefined||
 source.presetSha256!==launch.presetSha256||sha(fs.readFileSync(source.presetPath))!==source.presetSha256)
 throw new Error('Archive-only source with bound preset identity required');
if(!d.runStatus?.terminal||d.runStatus.exitStatus!==0||d.errors?.length||d.velocityProducerErrors?.length||!d.velocityProducerRecords?.length)
 throw new Error('Complete error-free native velocity producer capture required');
const failures=[],predictions=[];let comparedValues=0;
function check(stage,predicted,actual){
 if(!Number.isFinite(predicted)||!Number.isFinite(actual))throw new Error('Finite producer comparison required');
 comparedValues++;if(!Object.is(predicted,actual))failures.push({stage,predicted,actual});
}
for(const [index,r] of d.velocityProducerRecords.entries()){
 if(r.note!==source.note)throw new Error('Bound note coordinate required');
 const own=archiveVelocityProducerControls({...source,hostMode:source.velocityRuntime?.hostMode,host2fe0:source.velocityRuntime?.host2fe0}),c=own.controls;
 for(const key of ['hostMode','host2fe0','gA0','gC0','shared8c','shared90','sharedMode'])check(`${index}:${key}`,c[key],r[key]);
 for(const key of ['dimension','log_x','special_mode'])check(`${index}:curve:${key}`,c.velocityCurve[key],r.velocityCurve[key]);
 for(const axis of ['x','y']){
  if(c.velocityCurve[axis].length!==r.velocityCurve[axis]?.length)throw new Error('Complete native curve shape required');
  c.velocityCurve[axis].forEach((v,i)=>check(`${index}:curve:${axis}:${i}`,v,r.velocityCurve[axis][i]));
 }
 const velocity=velocityScaleFromControls({...c,host78:r.velocity,runtimeCurveMode:'linear-clamp'},{logf:nativeScalarLogf,expf:nativeScalarExp});
 const pitch=archivePitchSourceControls({baseFields:source.baseFields,note:r.note,host78:r.velocity,host80:velocity.velocityScale,runtimeCurveMode:'linear-clamp'});
 check(`${index}:velocity-scale`,velocity.velocityScale,r.velocityScale);
 check(`${index}:pitch-velocity-scale`,pitch.velocityScale,r.pitchVelocityScale);
 check(`${index}:pitch-strength`,pitch.strength,r.pitchStrength);
 check(`${index}:pitch-relaxation`,pitch.decay,r.pitchRelaxation);
 predictions.push({index,producer:own,velocity,pitch});
}
console.log(JSON.stringify({passed:!failures.length,records:d.velocityProducerRecords.length,comparedValues,mismatches:failures.length,failures,predictions,
 sourceSha256:sha(sourceBytes),captureSha256:sha(runtimeBytes),velocityInputObserved:true,velocityProducerControlsObserved:false,
 nativeCurveUsedForPrediction:false,completeVoiceVerified:false,finalStereoAudioVerified:false},null,2));
if(failures.length)process.exitCode=1;
