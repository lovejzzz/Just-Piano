#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {constructSoundboardLidGains} from '../dsp/soundboard-lid-gain.mjs';
const [directory]=process.argv.slice(2);
if(!directory)throw new Error('Usage: private-lid-gain-capture');
const runtime=JSON.parse(fs.readFileSync(path.join(directory,'runtime.json')));
if(!runtime.runStatus?.terminal||runtime.runStatus.exitStatus!==0||runtime.errors?.length||runtime.lidGainErrors?.length||runtime.lidGainPending||runtime.lidGainRecords?.length!==3)throw new Error('Complete three-component lid gain capture required');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function read(d){if(!d||path.basename(d.file)!==d.file)throw new Error('Invalid descriptor');const b=fs.readFileSync(path.join(directory,d.file));
 if(b.length!==d.bytes||digest(b)!==d.sha256)throw new Error('Lid source descriptor differs');return b;}
const floats=d=>new Float32Array(Uint8Array.from(read(d)).buffer);
function compare(v,d){const expected=read(d);if(expected.length!==v.byteLength)throw new Error('Lid gain shape differs');let mismatches=0;
 const bits=new Uint32Array(v.buffer,v.byteOffset,v.length);for(let i=0;i<v.length;i++)if(bits[i]!==expected.readUInt32LE(i*4))mismatches++;
 return {compared:v.length,mismatches,predictedSha256:digest(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))};}
const records=runtime.lidGainRecords.map((r,index)=>{
 if(r.index!==index||r.boundaryMode!==3)throw new Error('Native lid interpolation policy differs');
 const model=read(r.model),preset=read(r.preset),curve={...r.curve,x:floats(r.curve.x),y:floats(r.curve.y)};
 const result=constructSoundboardLidGains({curve,preset,modelFamily:model.readUInt32LE(0x98)});
 return {index,position:result.position,inputMatches:Object.is(result.position,r.input),
  interpolated:compare(result.interpolated,r.interpolated),output:compare(result.output,r.output)};
});
const passed=records.every(r=>r.inputMatches&&!r.interpolated.mismatches&&!r.output.mismatches);
console.log(JSON.stringify({passed,records,nativeGainSnapshotsUsedForPrediction:false,modelCurveAndPresetStillObserved:true,
 alternateModelGeometryVerified:false,fullConfigurationComputed:false,fullModelToIrGenerationVerified:false},null,2));if(!passed)process.exitCode=1;
