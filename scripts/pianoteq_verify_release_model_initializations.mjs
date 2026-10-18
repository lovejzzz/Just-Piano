#!/usr/bin/env node
// Cross-run audit of previously computed release models against fresh native initialization.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [reportFile,sourceFile,directory,...extra]=process.argv.slice(2);
if(!reportFile||!sourceFile||!directory||extra.length)throw new Error('Usage: verified-own-report.json private-archive-source.json private-native-directory');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const reportBytes=fs.readFileSync(reportFile),r=JSON.parse(reportBytes),sourceBytes=fs.readFileSync(sourceFile),source=JSON.parse(sourceBytes),captureBytes=fs.readFileSync(path.join(directory,'runtime.json')),d=JSON.parse(captureBytes),launch=JSON.parse(fs.readFileSync(path.join(directory,'launch.json'))),log=fs.readFileSync(path.join(directory,'lldb.log'));
if(r.passed!==true||r.computedReleaseModel!==true||r.releasePolynomialTailObserved!==false||r.releaseRateScaleObserved!==false||r.releaseDurationStillObserved!==true||r.dampingSourceSha256!==sha(sourceBytes))throw new Error('Bound passed own release-model report required');
if(source.presetSha256!==launch.presetSha256||sha(fs.readFileSync(source.presetPath))!==source.presetSha256||/could not read|corrupt (?:FXP file|archive)/i.test(log.toString()))throw new Error('Same valid native preset required');
if(d.complete!==true||d.runStatus?.terminal!==true||d.runStatus.exitStatus!==0||!Array.isArray(d.errors)||d.errors.length||d.activeSites!==0)throw new Error('Complete error-free native initialization required');
const before=d.records.filter(x=>x.stage==='before'),targets=d.records.filter(x=>x.stage==='initialize'),models=new Map(r.releaseModels.map(x=>[x.epoch,x])),sources=new Map(r.releaseModelSources.map(x=>[x.epoch,x]));
if(before.length!==5||targets.length!==5||models.size!==5||sources.size!==5||new Set(before.map(x=>x.ordinal)).size!==5||new Set(before.map(x=>x.voice)).size!==5||new Set(targets.map(x=>x.voice)).size!==5)throw new Error('Five unique initialized voices required');
let comparedValues=0;const failures=[];
function check(name,own,target){comparedValues++;if(!Number.isFinite(own)||!Number.isFinite(target)||!Object.is(own,target))failures.push({name,own,target});}
for(const b of before){
 const t=targets.find(x=>x.voice===b.voice),own=models.get(b.ordinal),src=sources.get(b.ordinal);
 if(b.note!==source.note||!t||!own||!src||src.decayRow.length!==t.inputs.selectedDecayRow.length)throw new Error('Matching explicit note, epoch and decay row required');
 for(const key of ['polynomial','rateScale','gainScale','cubicScale','cubicGainScale','timestep']){
  if(Array.isArray(own[key])){
   if(own[key].length!==t.actual[key].length)throw new Error('Complete polynomial comparison required');
   own[key].forEach((v,i)=>check(`${b.ordinal}:${key}:${i}`,v,t.actual[key][i]));
  }else check(`${b.ordinal}:${key}`,own[key],t.actual[key]);
 }
 check(`${b.ordinal}:columns`,src.columns,t.width);check(`${b.ordinal}:rows`,src.rows,t.inputs.decayRows);check(`${b.ordinal}:selected-row`,src.selectedRow,t.selectedRow);
 src.decayRow.forEach((v,i)=>check(`${b.ordinal}:decay-row:${i}`,v,t.inputs.selectedDecayRow[i]));
}
console.log(JSON.stringify({passed:!failures.length,comparedValues,mismatches:failures.length,failures,predictionReportSha256:sha(reportBytes),archiveSourceSha256:sha(sourceBytes),nativeCaptureSha256:sha(captureBytes),nativeLogSha256:sha(log),crossRunNativeInitializationAudit:true,sameRunModelGenerationVerified:false,releaseDurationStillObserved:true},null,2));
if(failures.length)process.exitCode=1;
