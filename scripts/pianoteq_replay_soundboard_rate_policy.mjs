#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {constructSoundboardRatePolicy,soundboardRateRatios} from '../dsp/soundboard-rate-policy.mjs';
const [directory,renderRateText,baseRateText='44100']=process.argv.slice(2);
if(!directory||!renderRateText)throw new Error('Usage: private-rate-capture render-rate [base-rate]');
const context={baseRate:Number(baseRateText),renderRate:Number(renderRateText)},own=constructSoundboardRatePolicy(context);
const runtime=JSON.parse(fs.readFileSync(path.join(directory,'runtime.json')));
if(!runtime.runStatus?.terminal||runtime.runStatus.exitStatus!==0||runtime.errors?.length||runtime.ratePolicyErrors?.length||
  runtime.ratePolicyPending||runtime.ratePolicyRecords?.length!==3)throw new Error('Complete terminal rate policy capture required');
function read(d){if(!d||path.basename(d.file)!==d.file)throw new Error('Invalid descriptor');const b=fs.readFileSync(path.join(directory,d.file));
 if(b.length!==d.bytes||crypto.createHash('sha256').update(b).digest('hex')!==d.sha256)throw new Error('Descriptor differs');return b;}
const failures=[];
runtime.ratePolicyRecords.forEach((record,i)=>{
 const input=read(record.runtime),table=read(record.ratioTable);
 if(input.length!==32||table.length!==72||record.component!==i)throw new Error('Rate source extent/order differs');
 if(input.readUInt32LE(0)!==context.baseRate||!Object.is(input.readFloatLE(16),Math.fround(context.renderRate)))failures.push({component:i,stage:'runtime-configuration'});
 soundboardRateRatios.flat().forEach((v,j)=>{if(table.readUInt32LE(j*4)!==v)failures.push({component:i,stage:'ratio-table',index:j});});
 if(!Object.is(record.outputRate,own.outputRate))failures.push({component:i,stage:'output-rate',actual:own.outputRate,expected:record.outputRate});
});
console.log(JSON.stringify({passed:!failures.length,configuration:context,selection:own,components:3,ratioWordsAudited:54,failures,
 nativeRuntimeSourceUsedForPrediction:false,nativeRatioTableUsedForPrediction:false,fullModelToIrGenerationVerified:false},null,2));
if(failures.length)process.exitCode=1;
