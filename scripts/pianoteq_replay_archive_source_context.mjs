// Recompute one model context; authentic snapshots are comparison targets only.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {constructArchiveSourceContext,archiveSourceContextAudit,archiveTunedNote,archiveNoteSourceInputs} from '../dsp/archive-source-context.mjs';
const [basePath,presetPath,finalPath,stretchedPath,anchorPath,weightsPath,tablePath,countsPath,sourcePath,output]=process.argv.slice(2);
if(!output)throw new Error('Base/preset, final/stretched/anchor/weights/table/counts/source captures and NEW report required');
const paths={basePath,presetPath,finalPath,stretchedPath,anchorPath,weightsPath,tablePath,countsPath,sourcePath},d={},sources={};
for(const [k,file] of Object.entries(paths)){const b=fs.readFileSync(file);d[k]=JSON.parse(b);sources[k]={sha256:crypto.createHash('sha256').update(b).digest('hex')};}
for(const k of Object.keys(d).filter(k=>!['basePath','presetPath'].includes(k)))if(d[k].errors?.length||!d[k].records?.length)throw new Error('Complete authentic captures required');
const base=d.basePath[0],preset=d.presetPath,cfg=d.stretchedPath.configurations?.[0],anchor=d.anchorPath.records[0],weights=d.weightsPath.records[0],table=d.tablePath.records[0],counts=d.countsPath.records[0];
if(d.finalPath.point!=='0x1008a3c60'||d.stretchedPath.point!=='0x1009626b4'||d.sourcePath.point!=='0x1007a4784'||
 d.finalPath.records.length!==315||d.stretchedPath.records.length!==315||d.sourcePath.records.length!==2||d.stretchedPath.configurations.length!==1)
 throw new Error('Expected complete 105-note triple traversals and two source modes');
const scalar=c=>({flags:c.log_x,special:c.special_mode,dimension:c.dimension});
const sourceCurveModes=Object.fromEntries([...Object.entries(cfg.base_curves).map(([k,c])=>['B'+k.slice(2),scalar(c)]),...Object.entries(cfg.preset_curves).map(([k,c])=>['A'+k.slice(2),scalar(c)])]);
const registry={middleWeight:weights.middle_weight,gramScale:weights.gram_scale,pitchScale:cfg.registry_constants.pitch_scale,
 referenceNote:cfg.registry_constants.reference_note,anchorMultiplier:anchor.registry_multiplier};
const context=constructArchiveSourceContext({baseFields:base.fields,presetFields:preset.decoded_tail.fields,sourceCurveModes,
 stretchCurveMode:scalar(counts.weight_curve),pitchCurveMode:scalar(cfg.pitch_edits),registry});
const audit=archiveSourceContextAudit(context),failures=[],checks=[];let float32Values=0,doubleValues=0;
const view=new DataView(new ArrayBuffer(8));
const bits=(x,float)=>{if(float){view.setFloat32(0,x);return view.getUint32(0).toString(16);}view.setFloat64(0,x);return view.getBigUint64(0).toString(16);};
function compare(name,a,b,float=false){
 if(a.length!==b.length||![...a,...b].every(Number.isFinite))throw new Error('Incomplete '+name);
 let mismatches=0;
 for(let i=0;i<a.length;i++)if(bits(a[i],float)!==bits(b[i],float)){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:a[i],actual:b[i]});}
 if(float)float32Values+=a.length;else doubleValues+=a.length;checks.push({name,count:a.length,mismatches});
}
compare('stiffness-table',audit.stiffnessTable,table.stiffness_table);
compare('stretch-rhs',audit.rhs,table.rhs);compare('stretch-matrix',audit.matrix.values,table.matrix.values);
compare('stretch-solution',audit.solution,table.solution);compare('stretch-table',audit.stretchTable,table.table,true);
const low=cfg.tuning_integers['0xe8'],high=cfg.tuning_integers['0x100'];
if(!Number.isInteger(low)||!Number.isInteger(high)||low<0||high>127||high-low+1!==105)throw new Error('Full configured 105-note interval required');
const expectedNotes=Array.from({length:105},(_,i)=>low+i),predictions=new Map(expectedNotes.map(note=>[note,archiveTunedNote(context,{note})]));
for(const [kind,capture] of [['final',d.finalPath],['stretched',d.stretchedPath]])for(const [i,row] of capture.records.entries()){
 const expectedNote=expectedNotes[i%105];if(row.note_index!==expectedNote||row.note!==expectedNote)throw new Error('Unordered/incomplete tuning traversal');
 const own=predictions.get(expectedNote),g=row.G_controls;
 if(kind==='final')compare('final:'+i,[own.baseline,own.anchored,own.referenceRatio,own.frequency,own.stretchFactor],[g['0x58'],g['0x5c'],g['0x60'],g['0x78'],g['0x80']],true);
 else compare('stretched:'+i,[own.stretchedFrequency,own.stretchFactor,own.initialRatio],[g['0x5c'],g['0x80'],g['0x60']],true);
}
const ordinary={flags:0,special:0,dimension:1},amplitudeCurveModes=Object.fromEntries(['B25b0','B26f0','B2790','A530'].map(k=>[k,ordinary]));
for(const r of d.sourcePath.records){
 const own=archiveNoteSourceInputs(context,{note:r.note,noteIndex:r.note_index,amplitudeCurveModes,instrumentMode:1,phaseCurveMode:ordinary});
 const p=own.physical,g=r.G_controls,c=r.cache_controls,v=r.G_vectors,w=r.cache_vectors;
 compare('source-G:'+r.mode,[p.stiffness,p.spread,own.tuning.frequency,own.amplitude.coupled.addedDecay],[g['0x28'],g['0x148'],g['0x78'],g['0x160']],true);
 compare('component-stiffness:'+r.mode,p.componentStiffness,v['0x40'],true);compare('offsets:'+r.mode,p.offsets,v['0x120'],true);
 compare('ratios:'+r.mode,own.modal.frequencyRatios,w['0x1f8'],true);compare('modal-coordinates:'+r.mode,own.modal.coordinates,w['0x1b8'],true);
 compare('amplitude-scale:'+r.mode,own.modal.componentAmplitudeScale,w['0x220'],true);compare('power-scale:'+r.mode,own.modal.componentPowerScale,w['0x248'],true);
 compare('source-cache:'+r.mode,[own.modal.offsetExponent,own.modal.coordinateScale,own.modal.blend,own.amplitude.coupled.shape,own.amplitude.coupled.shapeDb,own.phase.phaseAmount],
  [c['0x1a0'],c['0x1e0'],c['0x270'],c['0x128'],c['0x188'],c['0x158']],true);
}
const report={passed:failures.length===0,checks,failures,float32Values,doubleValues,uniqueTuningNotes:predictions.size,sourceRecords:2,sources,
 scope:'Own archive stiffness/stretch/tuning/physical/amplitude context; runtime modes and registry constants explicit; cross-historical captures',
 harmonicWeightsComputed:false,instrumentModeNewlyObserved:false,newAudioRendered:false,completeVoiceVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,checks:undefined,sources:undefined}));if(!report.passed)process.exitCode=1;
