#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {constructSoundboardArchiveSources} from '../dsp/soundboard-archive-source.mjs';
const [archivePath,directory]=process.argv.slice(2);
if(!directory)throw new Error('Usage: private-decoded-archive-json model-chain-capture-directory');
const archiveBytes=fs.readFileSync(archivePath),archive=JSON.parse(archiveBytes),own=constructSoundboardArchiveSources(archive);
const runtime=JSON.parse(fs.readFileSync(path.join(directory,'runtime.json'))),input=runtime.modelConfigurationInputs;
if(!runtime.runStatus?.terminal||runtime.runStatus.exitStatus!==0||runtime.errors?.length||!input||input.state!==runtime.capturedSource?.state||
 input.component!==(runtime.selectedDispatch??0)||!own.components[input.component])throw new Error('Complete bound model-chain capture required');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function read(d){if(!d||path.basename(d.file)!==d.file)throw new Error('Invalid descriptor');const b=fs.readFileSync(path.join(directory,d.file));
 if(b.length!==d.bytes||digest(b)!==d.sha256)throw new Error('Descriptor differs');return b;}
const source=own.components[input.component],model=read(input.model),preset=read(input.preset),modelView=Buffer.from(source.model),presetView=Buffer.from(source.preset);
const failures=[];let words=0,bytes=0;
for(const [label,target,actual,offsets]of [['model',model,modelView,source.modelOffsets],['preset',preset,presetView,source.presetOffsets]]){
 for(const offset of offsets){words++;if(target.readUInt32LE(offset)!==actual.readUInt32LE(offset))failures.push({label,offset,actual:actual.readUInt32LE(offset),expected:target.readUInt32LE(offset)});}}
for(const offset of source.modelBytes){bytes++;if(model[offset]!==modelView[offset])failures.push({label:'model-byte',offset,actual:modelView[offset],expected:model[offset]});}
function vector(label,actual,descriptor){const target=read(descriptor),b=Buffer.from(actual.buffer,actual.byteOffset,actual.byteLength);
 if(target.length!==b.length)throw new Error(label+' shape differs');let mismatches=0;for(let i=0;i<actual.length;i++){words++;if(b.readUInt32LE(i*4)!==target.readUInt32LE(i*4))mismatches++;}
 if(mismatches)failures.push({label,mismatches});}
vector('bridge',source.bridge,input.bridge);vector('propagation-modes',source.propagationModes,input.propagationModes);
vector('lid-knots',source.lidCurve.x,input.lidCurve.x);vector('lid-ordinates',source.lidCurve.y,input.lidCurve.y);
for(const key of ['dimensions','mode','logX'])if(source.lidCurve[key]!==input.lidCurve[key])failures.push({label:'lid-'+key});
const passed=!failures.length;
console.log(JSON.stringify({passed,component:input.component,words,bytes,failures,archiveSha256:digest(archiveBytes),
 nativeModelOrPresetSnapshotsUsedForConstruction:false,nativePointerLayoutRecreated:false,fullNativeRecordsRecreated:false,
 sourceResource:archive.sources,fullModelToIrGenerationVerified:false},null,2));if(!passed)process.exitCode=1;
