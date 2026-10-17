// Broader construction audit under explicit historical runtime conditions.
// No native targets exist for these tables; this is not audio equivalence.
import fs from 'node:fs';import crypto from 'node:crypto';
import {constructArchiveSourceContext,prepareArchiveSourceTables} from '../dsp/archive-source-context.mjs';
const [configPath,output]=process.argv.slice(2);if(!output)throw new Error('Private path configuration and NEW report required');
const paths=JSON.parse(fs.readFileSync(configPath)),d={},sources={};
for(const k of ['base','preset','stretched','anchor','stretchWeights','counts','constants','weightConstants','source','grids','before','radius','polynomial']){
 const bytes=fs.readFileSync(paths[k]);d[k]=JSON.parse(bytes);sources[k]=crypto.createHash('sha256').update(bytes).digest('hex');
 if(!['base','preset'].includes(k)&&(d[k].errors?.length||!d[k].records?.length))throw new Error('Complete historical runtime conditions required');
}
const scalar=c=>({flags:c.log_x,special:c.special_mode,dimension:c.dimension}),ordinary={flags:0,special:0,dimension:1};
const cfg=d.stretched.configurations?.[0],baseFields=d.base[0].fields,presetFields=d.preset.decoded_tail.fields;
if(!cfg)throw new Error('Original model range/tuning configuration required');
const low=cfg.tuning_integers['0xe8'],high=cfg.tuning_integers['0x100'];
if(!Number.isInteger(low)||!Number.isInteger(high)||low<1||high>127||high-low+1!==105)throw new Error('Complete original 105-note configured interval required');
const sourceCurveModes=Object.fromEntries([...Object.entries(cfg.base_curves).map(([k,c])=>['B'+k.slice(2),scalar(c)]),...Object.entries(cfg.preset_curves).map(([k,c])=>['A'+k.slice(2),scalar(c)])]);
const sw=d.stretchWeights.records[0],anchor=d.anchor.records[0],context=constructArchiveSourceContext({baseFields,presetFields,sourceCurveModes,
 stretchCurveMode:scalar(d.counts.records[0].weight_curve),pitchCurveMode:scalar(cfg.pitch_edits),registry:{middleWeight:sw.middle_weight,gramScale:sw.gram_scale,pitchScale:cfg.registry_constants.pitch_scale,referenceNote:cfg.registry_constants.reference_note,anchorMultiplier:anchor.registry_multiplier}});
const amplitudeCurveModes=Object.fromEntries(['B25b0','B26f0','B2790','A530'].map(k=>[k,ordinary]));
const runtimeCurveModes=Object.fromEntries(['B17d8','A8a8','B1828','B1878','Ad30','B18d0'].map(k=>[k,ordinary]));
const grid=presetFields.find(r=>r.object_offset===0x9a8)?.value?.grid,baseGrid=baseFields.find(r=>r.object_offset===0x1018)?.value?.rows;
if(!grid||!baseGrid)throw new Error('Complete archive harmonic grids required');
const constants=d.constants.records[0],weightOffset=d.weightConstants.records[0].weight_offset,poly=d.polynomial.records[0],radius=d.radius.records[0].radius;
const checks=[],failures=[],degrees={};let values=0,rows=0;
for(let note=low;note<=high;note++)for(const mode of [0,1]){
 try{
  const r=d.source.records.find(r=>r.mode===mode),gridConfig=d.grids.configurations[`69:${mode}`],before=d.before.records.find(r=>r.note_index===69&&r.cache_mode===mode);
  if(!r||!gridConfig||!before)throw new Error('Original runtime mode configuration required');
  const names=['globalDegrees','evenOffset','oddDegrees','evenDegrees','oddDelay','evenDelay'],offsets=['0x400','0x418','0x430','0x448','0x460','0x478'];
  const own=prepareArchiveSourceTables(context,{note,noteIndex:note,amplitudeCurveModes,instrumentMode:1,phaseCurveMode:ordinary,sourceRuntimeCurveMode:ordinary,
   weightSource:{runtimeCurveModes,harmonicCurveModes:{preset:grid.map(()=>ordinary),base:baseGrid.map(()=>ordinary)},weightOffset},
   integerScale:constants.integer_amplitude_scale,phaseConstant:constants.phase_constant,sampleRate:r.G_controls['0x98'],polynomialControls:{kappa:poly.kappa,gamma:poly.gamma},
   impedanceRuntime:{mode,runtimeCurveMode:'linear-clamp',phaseCurveMode:scalar(before.phase_curve),frequencyCurveModes:gridConfig.frequency_curves.map(scalar),polarRadius:radius},
   phaseOffsetControls:Object.fromEntries(names.map((name,i)=>[name,r.G_controls[offsets[i]]]))});
  if(!own.archiveRuntimeControlsComputed||!own.coupledPolesComputed||!own.harmonicWeightsComputed)throw new Error('Own archive source production required');
  for(const name of ['frequency','decay','amplitude','phase','normalizedAmplitude']){
   if(own[name].length!==own.rows*own.columns||[...own[name]].some(x=>!Number.isFinite(x)))throw new Error('Invalid finite source table '+name);
   values+=own[name].length;
  }
  if(own.rows===0?own.referenceIndex!==-1:own.referenceIndex<0||own.referenceIndex>=own.rows)throw new Error('Invalid reference index');
  if([...own.decay].some(x=>!(x>0)))throw new Error('Nonpositive source decay');
  rows+=own.rows;degrees[own.columns]=(degrees[own.columns]??0)+1;
  checks.push({note,mode,rows:own.rows,columns:own.columns,referenceIndex:own.referenceIndex,frequencyCutoff:own.runtimeSourceControls.frequencyCutoff,
   tableSha256:crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(['frequency','decay','amplitude','phase','normalizedAmplitude'].map(k=>[k,Array.from(own[k])])))).digest('hex')});
 }catch(error){failures.push({note,mode,error:error.message});}
}
const report={passed:!failures.length,expectedTables:210,tables:checks.length,notes:105,range:[low,high],rows,values,degrees,checks,failures,sources,
 runtimeConditionsBorrowedFromHistoricalA4:true,perNoteArchiveControlsComputed:true,nativeTargetComparison:false,newAudioRendered:false,
 scope:'Full configured note range construction and finite-table audit; not native root or sound equivalence',completeVoiceVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,checks:undefined,sources:undefined}));if(!report.passed)process.exitCode=1;
