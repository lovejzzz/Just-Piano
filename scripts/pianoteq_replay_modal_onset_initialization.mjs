#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {constructModalOnsetInitialization} from '../dsp/modal-onset-initialization.mjs';
const [directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw new Error('Usage: private-onset-capture-directory');
const runtimeBytes=fs.readFileSync(path.join(directory,'runtime.json'));
const runtime=JSON.parse(runtimeBytes);
if(!runtime.runStatus?.terminal||runtime.runStatus.exitStatus!==0||runtime.errors?.length||runtime.onsetErrors?.length||
  runtime.onsetPending||!runtime.onsetRecords?.length)throw new Error('Complete error-free native onset capture required');
const failures=[];let doubleValues=0,floatValues=0,stateValues=0;
for(const [index,input] of runtime.onsetRecords.entries()){
 const own=constructModalOnsetInitialization(input),d=input.state;
 if(!d||path.basename(d.file)!==d.file)throw new Error('Invalid onset state descriptor');
 const b=fs.readFileSync(path.join(directory,d.file));
 if(b.length!==72||b.length!==d.bytes||crypto.createHash('sha256').update(b).digest('hex')!==d.sha256)throw new Error('Onset descriptor differs');
 for(let i=0;i<2;i++){doubleValues++;if(!Object.is(own.step[i],b.readDoubleLE(0x20+i*8)))failures.push({index,stage:'step',element:i});}
 for(const [offset,value] of [[0x10,0],[0x18,1]]){doubleValues++;if(!Object.is(b.readDoubleLE(offset),value))failures.push({index,stage:'oscillator',offset});}
 if(own.filterCoefficientsUsed)for(let i=0;i<3;i++){floatValues++;if(!Object.is(own.coefficients[i],b.readFloatLE(0x34+i*4)))failures.push({index,stage:'filter',element:i});}
 if(own.filterCoefficientsUsed)for(const offset of [0x40,0x44]){floatValues++;if(!Object.is(b.readFloatLE(offset),0))failures.push({index,stage:'history',offset});}
 for(const [offset,actual] of [[0,input.duration+own.settle],[4,own.settle]]){stateValues++;if(b.readUInt32LE(offset)!==actual)failures.push({index,stage:'count',offset});}
 for(const [offset,value] of [[0xc,Number(own.square)],[0x30,Number(own.filterCoefficientsUsed)]]){stateValues++;if(b.readUInt8(offset)!==value)failures.push({index,stage:'branch',offset});}
}
console.log(JSON.stringify({passed:!failures.length,records:runtime.onsetRecords.length,doubleValues,floatValues,stateValues,failures,
 captureSha256:crypto.createHash('sha256').update(runtimeBytes).digest('hex'),
 nativeStepAndCoefficientsUsedForPrediction:false,completeVoiceVerified:false,finalStereoAudioVerified:false},null,2));
if(failures.length)process.exitCode=1;
