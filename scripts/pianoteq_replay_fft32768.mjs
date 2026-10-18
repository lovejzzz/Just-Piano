#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {forwardReal32768,inverseReal32768} from '../dsp/real-fft-32768.mjs';
import {buildReal32768Coefficients} from '../dsp/real-fft-32768-coefficients.mjs';
const [directory]=process.argv.slice(2);
if(!directory)throw new Error('Usage: native-FFT32768-capture-directory');
const runtime=JSON.parse(fs.readFileSync(path.join(directory,'runtime.json')));
if(runtime.errors?.length||runtime.fftErrors?.length||runtime.fftPending||!runtime.runStatus?.terminal||runtime.runStatus.exitStatus!==0||runtime.fftRecords?.length!==6)throw new Error('Complete six-call FFT32768 capture required');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function read(d,length){if(!d||path.basename(d.file)!==d.file)throw new Error('Invalid descriptor');const bytes=fs.readFileSync(path.join(directory,d.file));
 if(bytes.length!==length||bytes.length!==d.bytes||digest(bytes)!==d.sha256)throw new Error('FFT capture digest/shape differs');return bytes;}
function compare(output,expected,mask=null){const actual=new Uint32Array(output.buffer,output.byteOffset,output.length);let compared=0,mismatches=0,first=null;
 for(let i=0;i<actual.length;i++){if(mask&&!mask[i])continue;compared++;if(!Number.isFinite(expected.readFloatLE(i*4)))throw new Error('Non-finite native target');
  if(actual[i]!==expected.readUInt32LE(i*4)){mismatches++;first??={index:i,actual:output[i],expected:expected.readFloatLE(i*4)};}}
 return {compared,mismatches,first,predictedSha256:digest(new Uint8Array(output.buffer,output.byteOffset,output.byteLength))};}
const coefficients=buildReal32768Coefficients();
const records=runtime.fftRecords.map((record,index)=>{
 const setup=read(record.setup,0x88),words=Array.from({length:11},(_,i)=>setup.readUInt32LE(i*4));
 if(record.number!==index||record.length!==32768||record.direction!==index%2||words.some((v,i)=>v!==[32768,4096,8192,7,2,4,4,4,4,4,4][i])||setup.readUInt32LE(0x6c)!==0)throw new Error('Unverified native FFT32768 profile');
 const e=compare(coefficients.e,read(record.e,32768*3));
 const twiddle=compare(coefficients.twiddle,read(record.twiddle,32768),coefficients.usedTwiddle);
 const input=new Float32Array(Uint8Array.from(read(record.input,32768*4)).buffer);
 const output=(record.direction?inverseReal32768:forwardReal32768)(input);
 return {record:index,direction:record.direction,e,twiddle,transform:compare(output,read(record.output,32768*4))};
});
const passed=records.every(r=>![r.e,r.twiddle,r.transform].some(c=>c.mismatches));
console.log(JSON.stringify({passed,records,coefficientsComputed:true,nativePlanCoefficientsUsedForPrediction:false,
 inverseScaled:false,nativeTransformVerifiedForCapturedProfile:passed,shapingComputed:false},null,2));if(!passed)process.exitCode=1;
