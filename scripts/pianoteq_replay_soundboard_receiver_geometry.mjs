#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {initializeSoundboardFromConfig} from '../dsp/soundboard-initialization.mjs';
import {constructSoundboardMatrices} from '../dsp/soundboard-matrix-construction.mjs';
import {constructSoundboardReceiverGeometry} from '../dsp/soundboard-receiver-geometry.mjs';
const [directory]=process.argv.slice(2);
if(!directory)throw new Error('Usage: private-receiver-geometry-capture');
const runtime=JSON.parse(fs.readFileSync(path.join(directory,'runtime.json')));
if(!runtime.runStatus?.terminal||runtime.runStatus.exitStatus!==0||runtime.errors?.length||runtime.receiverGeometryErrors?.length||
 runtime.receiverGeometryPending||runtime.receiverGeometryRecords?.length!==3)throw new Error('Complete receiver geometry capture required');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function read(d){if(!d||path.basename(d.file)!==d.file)throw new Error('Invalid descriptor');const b=fs.readFileSync(path.join(directory,d.file));
 if(b.length!==d.bytes||digest(b)!==d.sha256)throw new Error('Descriptor digest differs');return b;}
const floats=d=>new Float32Array(Uint8Array.from(read(d)).buffer);
function compare(output,d,label){const expected=read(d),actual=Buffer.from(output.buffer,output.byteOffset,output.byteLength);
 if(actual.length!==expected.length)throw new Error('Comparison length differs');let mismatches=0,first=null;
 for(let i=0;i<actual.length;i+=4)if(actual.readUInt32LE(i)!==expected.readUInt32LE(i)){mismatches++;first??={index:i/4,actual:actual.readUInt32LE(i),expected:expected.readUInt32LE(i)};}
 return {label,compared:output.length,mismatches,first,predictedSha256:digest(actual)};}
const records=runtime.receiverGeometryRecords.map((r,index)=>{
 if(r.index!==index)throw new Error('Group order differs');const config=read(r.config),get=o=>config.readFloatLE(o);
 const {grid,matrixControls}=initializeSoundboardFromConfig(config,floats(r.bridge));
 const matrices=constructSoundboardMatrices(grid,matrixControls);
 const parameters=[get(0x30),get(0x38),get(0x34),get(0x60),get(0x3c),get(0x40),...grid.boundaryScale];
 const controlMismatches=parameters.reduce((n,p,i)=>n+Number(!Object.is(p,r.parameters[i])),0);
 const result=constructSoundboardReceiverGeometry({grid,shape:matrices.shape,primary:r.primary.map(floats),offsets:r.offsets.map(floats),
  parents:new Uint32Array(Uint8Array.from(read(r.parents)).buffer),offsetScale:r.offsetScale,
  width:parameters[0],height:parameters[1],planeHeight:parameters[2],planeOffset:parameters[3],
  angleScale:parameters[4],angleDegrees:parameters[5],mirror:r.mirror});
 if(result.geometry.length!==r.geometry.length)throw new Error('Receiver count differs');
 const comparisons=[compare(matrices.shape,r.shape,'shape')];let metadataMismatches=0;
 result.geometry.forEach((g,i)=>{const expected=r.geometry[i];comparisons.push(compare(g.coordinates,expected.coordinates,`receiver-${i}`));
  for(const key of ['amplitude','identity','channel','kind','serial'])metadataMismatches+=Number(!Object.is(g[key],expected[key]));});
 return {index,controlMismatches,metadataMismatches,comparisons,angle:result.angle,normal:[...result.normal],
  nontrivialAttenuationCount:result.attenuations.filter(a=>a.attenuation!==0&&a.attenuation!==1).length};
});
const passed=records.every(r=>!r.controlMismatches&&!r.metadataMismatches&&r.comparisons.every(c=>!c.mismatches));
console.log(JSON.stringify({passed,records,capturedSpatialShapeOrFinalCoordinatesUsedForPrediction:false,
 primaryCoordinatesAndRelativeOffsetsStillCaptured:true,mirrorAndOffsetScaleStillCaptured:true,
 fullModelToIrGenerationVerified:false},null,2));if(!passed)process.exitCode=1;
