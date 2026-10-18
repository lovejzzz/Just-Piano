#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {constructSoundboardModelConfig} from '../dsp/soundboard-model-config.mjs';
const [directory]=process.argv.slice(2);
if(!directory)throw new Error('Usage: private-model-config-capture');
const runtime=JSON.parse(fs.readFileSync(path.join(directory,'runtime.json')));
if(!runtime.runStatus?.terminal||runtime.runStatus.exitStatus!==0||runtime.errors?.length||runtime.modelConfigErrors?.length||
 runtime.modelConfigPending||runtime.modelConfigRecords?.length!==3)throw new Error('Complete three-component configuration capture required');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function read(d){if(!d||path.basename(d.file)!==d.file)throw new Error('Invalid descriptor');const b=fs.readFileSync(path.join(directory,d.file));
 if(b.length!==d.bytes||digest(b)!==d.sha256)throw new Error('Descriptor digest differs');return b;}
const floats=d=>new Float32Array(Uint8Array.from(read(d)).buffer);
const records=runtime.modelConfigRecords.map((r,i)=>{
 if(r.index!==i||r.component!==i||r.mode!==0||!['linear','twoPosition'].every(k=>[0,1].includes(r.sourcePositionFlags[k])))throw new Error('Unverified source component/policy');
 const own=constructSoundboardModelConfig({model:read(r.model),preset:read(r.preset),bridge:floats(r.bridge),
  propagationModes:floats(r.propagationModes),component:r.component,mode:r.mode,
  linearPosition:Boolean(r.sourcePositionFlags.linear),twoPosition:Boolean(r.sourcePositionFlags.twoPosition)});
 const target=read(r.config),actual=Buffer.from(own.config);let wordMismatches=0,byteMismatches=0,first=null;
 for(const offset of own.computedOffsets)if(actual.readUInt32LE(offset)!==target.readUInt32LE(offset)){wordMismatches++;first??={offset,actual:actual.readUInt32LE(offset),expected:target.readUInt32LE(offset)};}
 for(const offset of own.computedBytes)if(actual[offset]!==target[offset]){byteMismatches++;first??={offset,actual:actual[offset],expected:target[offset]};}
 const expectedBridge=read(r.outputBridge),bridgeBytes=Buffer.from(own.bridge.buffer);if(expectedBridge.length!==bridgeBytes.length)throw new Error('Bridge shape differs');
 let bridgeMismatches=0;for(let j=0;j<own.bridge.length;j++)if(expectedBridge.readUInt32LE(j*4)!==bridgeBytes.readUInt32LE(j*4))bridgeMismatches++;
 const predictedWords=Uint32Array.from(own.computedOffsets,o=>actual.readUInt32LE(o));
 return {component:r.component,wordCount:own.computedOffsets.length,byteCount:own.computedBytes.length,
  wordMismatches,byteMismatches,bridgeMismatches,first,predictedSha256:digest(new Uint8Array(predictedWords.buffer))};
});
const passed=records.every(r=>!r.wordMismatches&&!r.byteMismatches&&!r.bridgeMismatches);
console.log(JSON.stringify({passed,records,downstreamConfigurationUsedForPrediction:false,sourceModelAndPresetStillObserved:true,
 outputRateComputed:false,gainCurvesComputed:false,fullConfigurationComputed:false,fullModelToIrGenerationVerified:false},null,2));if(!passed)process.exitCode=1;
