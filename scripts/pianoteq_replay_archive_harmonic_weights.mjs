import fs from 'node:fs';
import crypto from 'node:crypto';
import {constructArchiveSourceContext,archiveNoteSourceWeights} from '../dsp/archive-source-context.mjs';
const [basePath,presetPath,beforePath,afterPath,constantsPath,stretchedPath,anchorPath,stretchWeightsPath,countsPath,output]=process.argv.slice(2);
if(!output)throw new Error('Base, preset, before/after/constants/stretched/anchor/stretch-weights/counts captures and NEW report required');
const paths={basePath,presetPath,beforePath,afterPath,constantsPath,stretchedPath,anchorPath,stretchWeightsPath,countsPath},d={},sources={};
for(const [k,path] of Object.entries(paths)){const b=fs.readFileSync(path);d[k]=JSON.parse(b);sources[k]=crypto.createHash('sha256').update(b).digest('hex');}
for(const k of Object.keys(paths).filter(k=>!['basePath','presetPath'].includes(k)))if(d[k].errors?.length||!d[k].records?.length)throw new Error('Complete capture required');
if(d.beforePath.records.length!==1||d.afterPath.records.length!==2||d.beforePath.point!=='0x1004cb68c')throw new Error('Expected original A4 weight/source captures');
const runtimeCurveModes=Object.fromEntries(['B17d8','A8a8','B1828','B1878','Ad30','B18d0'].map(k=>[k,{flags:0,special:0,dimension:1}]));
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const row=d.beforePath.records[0],baseFields=d.basePath[0].fields,presetFields=d.presetPath.decoded_tail.fields;
const offset=d.constantsPath.records[0].weight_offset;
if(!d.constantsPath.records.every(r=>r.weight_offset===offset))throw new Error('Registry offset conflict');
const cfg=d.stretchedPath.configurations?.[0],anchor=d.anchorPath.records[0],stretchWeights=d.stretchWeightsPath.records[0],counts=d.countsPath.records[0];
if(!cfg)throw new Error('Tuning configuration required');
const scalar=c=>({flags:c.log_x,special:c.special_mode,dimension:c.dimension});
const sourceCurveModes=Object.fromEntries([...Object.entries(cfg.base_curves).map(([k,c])=>['B'+k.slice(2),scalar(c)]),...Object.entries(cfg.preset_curves).map(([k,c])=>['A'+k.slice(2),scalar(c)])]);
const registry={middleWeight:stretchWeights.middle_weight,gramScale:stretchWeights.gram_scale,pitchScale:cfg.registry_constants.pitch_scale,referenceNote:cfg.registry_constants.reference_note,anchorMultiplier:anchor.registry_multiplier};
const context=constructArchiveSourceContext({baseFields,presetFields,sourceCurveModes,stretchCurveMode:scalar(counts.weight_curve),pitchCurveMode:scalar(cfg.pitch_edits),registry});
const scalarMode={flags:0,special:0,dimension:1};
const control=presetFields.find(r=>r.object_offset===0x9a8)?.value,modelGrid=baseFields.find(r=>r.object_offset===0x1018)?.value;
if(!control?.grid||!modelGrid?.rows)throw new Error('Harmonic archive grids required');
const harmonicCurveModes={preset:control.grid.map(()=>scalarMode),base:modelGrid.rows.map(()=>scalarMode)};
const own=archiveNoteSourceWeights(context,{note:row.note,noteIndex:row.note_index,runtimeCurveModes,harmonicCurveModes,weightOffset:offset});
const failures=[],checks=[];
const compare=(name,a,b)=>{if(a.length!==b.length)throw new Error('Shape mismatch');let mismatches=0;for(let i=0;i<a.length;i++)if(bits(a[i])!==bits(b[i])){mismatches++;failures.push({name,index:i,predicted:a[i],actual:b[i]});}checks.push({name,values:a.length,mismatches});};
compare('four-weight-controls',Object.values(own.input.controls),['s0','s1','s2','s3'].map(k=>row.controls[k]));
const b=new Map(baseFields.map(r=>[r.object_offset,r.value]));
compare('base-weights-identity',b.get(0x1c28)[row.note_index-1],row.weights);
compare('coordinates-identity',b.get(0x1c40)[row.note_index-1],row.coordinates);
compare('own-harmonic-edits',own.harmonicEdits,row.harmonic_edits);
for(const key of ['edit_curve','base_curve'])for(const axis of ['x','y'])compare(key+':'+axis,own.input[key][axis],row[key][axis]);
compare('own-physical-controls',[own.input.G_controls['0x28'],own.input.G_controls['0x78']],[row.G_controls['0x28'],row.G_controls['0x78']]);
compare('G-weight-scalars',[own.input.G_controls['0xd8'],own.input.G_controls['0xf0']],[row.G_controls['0xd8'],row.G_controls['0xf0']]);
if(own.input.active_edit_curve!==row.active_edit_curve)throw new Error('Spectrum activation mismatch');
const predicted=own;
for(const after of d.afterPath.records){if(after.note!==row.note||after.note_index!==row.note_index)throw new Error('Unaligned note');compare('final-weights-mode-'+after.mode,predicted.output,after.G_vectors['0x6f0']);}
const report={passed:!failures.length,checks,failures,sources,computedControls:own.input.controls,
 runtimeCurveModesExplicit:true,runtimeCurveModesNewlyObserved:false,remainingObservedInputs:['weight registry offset','tuning registry values and runtime modes'],
 uniqueWeights:predicted.output.length,harmonicEditsComputed:own.harmonicEditsComputed,harmonicEditsUsedAsInput:false,newAudioRendered:false,completeVoiceVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
