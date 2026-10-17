// Isolated model-generation checks, never a complete audio equivalence claim.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {archiveRepeatedStrikeFields} from '../dsp/archive-repeat-model.mjs';
const [basePath,presetPath,capturePath,reportPath]=process.argv.slice(2);
if(!basePath||!presetPath||!capturePath||!reportPath)throw new Error('Usage: decoded-base-values.json inspected-preset.json capture.json report.json');
const bases=JSON.parse(fs.readFileSync(basePath)),presets=JSON.parse(fs.readFileSync(presetPath)),data=JSON.parse(fs.readFileSync(capturePath));
if(presets.length!==1||!presets[0].dlla_payload_md5_verified)throw new Error('One integrity-checked preset required');
const preset=presets[0];
if(crypto.createHash('sha256').update(fs.readFileSync(preset.path)).digest('hex')!==preset.sha256)throw new Error('Preset changed since inspection');
const identity=preset.model.identity;
if(identity?.length<2)throw new Error('Explicit model identity required');
const matches=bases.filter(b=>b.model_identity.startsWith(identity[0]+';'+identity[1]+';'));
if(matches.length!==1||matches[0].version!==89)throw new Error('Unique decoded base model required');
const base=matches[0],outputs=[],failures=[];
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{if(!Number.isFinite(x))throw new Error('Finite compared float required');view.setFloat32(0,x);return view.getUint32(0);};
let checks=0,mismatches=0,context;
const check=(name,p,a)=>{checks++;if(bits(p)!==bits(a)){mismatches++;failures.push({name,predicted:p,actual:a,context});}};
for(let epoch=0;epoch<5;epoch++){
 const weights=data.records.filter(r=>r.stage==='weights'&&r.epoch===epoch),first=data.records.find(r=>r.stage==='consumer'&&r.epoch===epoch);
 if(weights.length!==2||!first||first.counter!==0)throw new Error('Two source families and consumer at zero required');
 const note=weights[0].input.note,sampleRate=weights[0].selectionSource.sampleRate;
 const generated=archiveRepeatedStrikeFields({baseFields:base.fields,note,sampleRate,runtimeMode:'linear-clamp'});
 context={epoch,note};outputs.push({epoch,...generated});
 check('envelope-rate',generated.fields['0x378'],first.injectionPre.envelope.rate);
 check('envelope-duration',generated.envelope.duration,first.injectionPre.envelope.duration);
 for(const r of weights){
  if(r.input.note!==note||r.selectionSource.sampleRate!==sampleRate)throw new Error('Model coordinates changed between families');
  check('repeat-scale',generated.fields['0x380'],r.input.controls.repeatScale);
  check('history-random-scale',generated.fields['0x388'],r.historyControls.randomScale);
  check('history-upper',generated.fields['0x38c'],r.historyControls.upper);
  check('history-lower',generated.fields['0x390'],r.historyControls.lower);
  check('phase-random-scale',generated.fields['0x394'],r.randomScale);
 }
 for(const r of data.records.filter(r=>r.stage==='before'&&r.inputs.old&&r.oldVoice===first.voice))check('hold-duration',generated.fields['0x37c'],r.inputs.old.duration);
}
const result={passed:mismatches===0,scope:'archive-repeat-model-fields-only',checks,mismatches,modelIdentity:base.model_identity,presetSha256:preset.sha256,baseValuesSha256:crypto.createHash('sha256').update(fs.readFileSync(basePath)).digest('hex'),captureComplete:data.complete,captureErrors:data.errors,runtimeModeRequested:'linear-clamp',verifiedNotes:[...new Set(outputs.map(o=>o.note))],allNotesVerified:false,field384NotObserved:true,fullAudioVerified:false,outputs,failures};
fs.writeFileSync(reportPath,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,outputs:undefined}));if(!result.passed)process.exitCode=1;
