import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {archiveTimeEnvelopeAtKnot} from '../dsp/archive-time-envelope.mjs';
const [capturePath,sourcePath,reportPath,...extra]=process.argv.slice(2);
if(!reportPath||extra.length)throw new Error('Usage: capture.json decoded-source.json new-report.json');
const data=JSON.parse(fs.readFileSync(capturePath)),source=JSON.parse(fs.readFileSync(sourcePath));
if(source.schema!==1||source.presetSha256!==crypto.createHash('sha256').update(fs.readFileSync(source.presetPath)).digest('hex'))throw new Error('Verified source preset required');
const command=fs.readFileSync(path.join(path.dirname(capturePath),'commands.lldb'),'utf8');
if(!command.includes('--fxp '+source.presetPath+' --midi '))throw new Error('Exact capture preset identity required');
if(!data.complete||data.errors?.length||!data.activeTimeComponent)throw new Error('Complete active time capture required');
const selections=data.records.filter(r=>r.stage==='selection');
if(selections.length!==5||new Set(selections.map(r=>r.epoch)).size!==5)throw new Error('Five unique selected voices required');
const view=new DataView(new ArrayBuffer(4)),bits=v=>{if(!Number.isFinite(v))throw new Error('Finite model target required');view.setFloat32(0,v);return view.getUint32(0);};
let checks=0,mismatches=0;const predictions=[],failures=[];
for(const r of selections){
 const model=archiveTimeEnvelopeAtKnot({editFields:source.editFields,note:r.note});
 predictions.push({epoch:r.epoch,...model});
 for(const k of ['globalAttack','legatoAttack']){checks++;if(bits(model[k])!==bits(r.source[k])){mismatches++;failures.push({epoch:r.epoch,field:k,predicted:model[k],actual:r.source[k]});}}
}
const report={passed:!mismatches,checks,mismatches,predictions,predictionHash:crypto.createHash('sha256').update(JSON.stringify(predictions)).digest('hex'),scope:'Archive object1470 to observed selected global fields at exact curve knots',audioSamplesCompared:0,fullVoiceSourceComputed:false,finalStereoAudioVerified:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(mismatches)process.exitCode=1;
