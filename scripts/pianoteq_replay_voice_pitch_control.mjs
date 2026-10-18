#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DynamicPitchTrajectory} from '../dsp/dynamic-pitch.mjs';
const [directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw new Error('Usage: private-pitch-capture-directory');
const bytes=fs.readFileSync(path.join(directory,'runtime.json')),d=JSON.parse(bytes);
if(!d.runStatus?.terminal||d.runStatus.exitStatus!==0||d.errors?.length||d.pitchErrors?.length||d.pitchPending||!d.pitchRecords?.length)
 throw new Error('Complete native pitch capture required');
function read(descriptor,length){
 if(!descriptor||path.basename(descriptor.file)!==descriptor.file)throw new Error('Invalid pitch descriptor');
 const b=fs.readFileSync(path.join(directory,descriptor.file));
 if(b.length!==length||descriptor.bytes!==length||crypto.createHash('sha256').update(b).digest('hex')!==descriptor.sha256)throw new Error('Pitch descriptor mismatch');
 return b;
}
const failures=[],predictions=[];let checks=0,voice,initialControls,refreshAudits=0,inactiveNativeRefreshes=0,inactiveNativeSkips=0;
for(const [index,row] of d.pitchRecords.entries()){
 const b=read(row.control,0x1c4),a=read(row.after,0x1c4),energy=read(row.energy,8);
 const value=offset=>b.readFloatLE(offset-0x780),byte=offset=>b.readUInt8(offset-0x780);
 // Current capture exercises the stationary zero-cents base and exponential
 // branch. Reject modulation/glide instead of reading native final base pitch.
 const initialReset=index===0&&byte(0x83d)===1&&value(0x82c)===-1000000;
 if(byte(0x934)!==1||(!initialReset&&value(0x82c)!==0)||value(0x8b8)!==0||value(0x8bc)!==0||
    value(0x834)!==0||value(0x830)!==0||value(0x828)!==0||value(0x824)!==0)
  throw new Error('Only audited stationary zero-cents exponential pitch branch supported');
 const controls={timestep:value(0x8fc),centsA:0,centsB:0,strength:value(0x938),velocityScale:value(0x940),modalDecay:energy.readFloatLE(4),relaxation:value(0x93c),exponentialBranch:true,released:false,releaseRule:false,damperFlag:false,releaseAmount:0,smoothedRatio:1};
 if(!voice){
  if(row.counter!==0||byte(0x930)!==0)throw new Error('Pitch window must start at zero with clear latch');
  initialControls=controls;voice=new DynamicPitchTrajectory(controls);
 }
 if(Object.keys(controls).some(k=>!Object.is(controls[k],initialControls[k])))throw new Error('Producer control change outside audited fixed-control branch');
 const own=voice.next(64);
 checks+=3;
 if(own.counter!==row.counter)throw new Error('Noncontiguous pitch update window');
 if(!Object.is(own.pitch,a.readFloatLE(0)))failures.push({index,stage:'pitch',predicted:own.pitch,actual:a.readFloatLE(0)});
 if(Number(own.disabled)!==a.readUInt8(0x930-0x780))failures.push({index,stage:'latch'});
 if(row.refreshRequired!==undefined){
  if(typeof row.refreshRequired!=='boolean')throw new Error('Boolean native refresh flag required');
  checks++;refreshAudits++;
  if(own.applied&&!row.refreshRequired)failures.push({index,stage:'required-pitch-refresh'});
  if(!own.applied){if(row.refreshRequired)inactiveNativeRefreshes++;else inactiveNativeSkips++;}
 }
 predictions.push(own);
}
console.log(JSON.stringify({schema:'pianoteq-fixed-pitch-trajectory-pass241',passed:!failures.length,mismatches:failures.length,checks,records:d.pitchRecords.length,failures,predictions,initialControls,
 captureSha256:crypto.createHash('sha256').update(bytes).digest('hex'),nativePitchUsedForPrediction:false,
 ageCounterComputed:true,latchStateCarried:true,refreshAudits,inactiveNativeRefreshes,inactiveNativeSkips,
 producerControlsAndMeanDecayObserved:true,completeVoiceVerified:false,finalStereoAudioVerified:false},null,2));
if(failures.length)process.exitCode=1;
