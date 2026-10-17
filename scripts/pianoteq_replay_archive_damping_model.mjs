import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {archiveDampingDuration} from '../dsp/archive-damping-duration.mjs';
const [capturePath,sourcePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!sourcePath||!reportPath||extra.length)throw new Error('Usage: capture.json decoded-damping-source.json new-report.json');
const data=JSON.parse(fs.readFileSync(capturePath)),source=JSON.parse(fs.readFileSync(sourcePath));
if(source.schema!==1||source.presetSha256!==crypto.createHash('sha256').update(fs.readFileSync(source.presetPath)).digest('hex'))throw new Error('Verified preset source identity required');
const command=fs.readFileSync(path.join(path.dirname(capturePath),'commands.lldb'),'utf8');
if(!command.includes('--fxp '+source.presetPath+' --midi '))throw new Error('Capture command must use the exact source preset');
const notes=new Map();
for(const r of data.records)if(r.stage==='weights'){
 const note=r.input.note;
 if(notes.has(r.epoch)&&notes.get(r.epoch)!==note)throw new Error('Changing model note unsupported');
 notes.set(r.epoch,note);
}
if(notes.size!==5)throw new Error('Five initialized voice sources required');
const models=new Map([...notes].map(([epoch,note])=>[epoch,archiveDampingDuration({...source,note})]));
let checks=0,mismatches=0,coefficientComparisons=0,terminalComparisons=0;
const failures=[],word=new DataView(new ArrayBuffer(4));
const bits=x=>{if(!Number.isFinite(x))throw new Error('Finite damping field required');word.setFloat32(0,x);return word.getUint32(0);};
function check(name,r,p,a){checks++;if(bits(p)!==bits(a)){mismatches++;if(failures.length<12)failures.push({name,epoch:r.epoch,counter:r.counter,predicted:p,actual:a});}}
for(const r of data.records){
 const model=models.get(r.epoch);if(!model)continue;
 if(r.stage==='coefficients'){check('observed-release-duration',r,model.duration,r.inputs.polynomial[0]);coefficientComparisons++;}
 if(r.stage==='audioReturn'&&r.tail){
  check('observed-primary-scale',r,Math.min(1,model.duration),r.tail.primary.scale);
  check('observed-secondary-scale',r,model.duration,r.tail.secondary.scale);terminalComparisons+=2;
 }
}
if(!coefficientComparisons||!terminalComparisons)throw new Error('Both actual release and terminal model targets required');
const predictions=[...models].map(([epoch,model])=>({epoch,...model}));
const report={passed:!mismatches,scope:'Decoded damping helper compared with observed normal-model duration fields',checks,mismatches,coefficientComparisons,terminalComparisons,voices:models.size,distinctNotes:new Set(notes.values()).size,predictions,predictionHash:crypto.createHash('sha256').update(JSON.stringify(predictions)).digest('hex'),fullCaptureComplete:data.complete===true,nativeHelperCallObserved:false,globalFrequencyFloorOrInstrumentOverridesVerified:false,activeConditionCompared:predictions.some(p=>p.conditionActive),audioSamplesCompared:0,finalStereoAudioVerified:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,predictions:undefined,failures:undefined}));if(!report.passed)process.exitCode=1;
