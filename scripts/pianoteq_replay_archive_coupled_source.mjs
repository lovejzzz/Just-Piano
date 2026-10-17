// Config maps named paths to private original captures/model archives.
// Targets are compared after prediction; no target pole/table enters production.
import fs from 'node:fs';import crypto from 'node:crypto';
import {constructArchiveSourceContext,prepareArchiveSourceTables} from '../dsp/archive-source-context.mjs';
const [configPath,output]=process.argv.slice(2);if(!output)throw new Error('Private path configuration and NEW report required');
const paths=JSON.parse(fs.readFileSync(configPath)),d={},sources={};
const names=['base','preset','stretched','anchor','stretchWeights','counts','constants','weightConstants','source','normalized','amplitude','poles','grids','before','radius','polynomial'];
for(const k of names){if(typeof paths[k]!=='string')throw new Error('Missing path '+k);const bytes=fs.readFileSync(paths[k]);d[k]=JSON.parse(bytes);sources[k]=crypto.createHash('sha256').update(bytes).digest('hex');}
for(const k of names.filter(k=>!['base','preset'].includes(k)))if(d[k].errors?.length||!d[k].records?.length)throw new Error('Incomplete original capture '+k);
if(d.source.point!=='0x1007a4784'||d.source.records.length!==2||d.normalized.point!=='0x1007a48d4'||d.normalized.records.length!==2||d.poles.records.length!==36||d.before.records.length!==36)throw new Error('Complete original two-mode / 36-row captures required');
const scalar=c=>({flags:c.log_x,special:c.special_mode,dimension:c.dimension}),ordinary={flags:0,special:0,dimension:1};
const cfg=d.stretched.configurations?.[0],anchor=d.anchor.records[0],sw=d.stretchWeights.records[0],counts=d.counts.records[0];
if(!cfg)throw new Error('Original tuning configuration required');
const baseFields=d.base[0].fields,presetFields=d.preset.decoded_tail.fields;
const sourceCurveModes=Object.fromEntries([...Object.entries(cfg.base_curves).map(([k,c])=>['B'+k.slice(2),scalar(c)]),...Object.entries(cfg.preset_curves).map(([k,c])=>['A'+k.slice(2),scalar(c)])]);
const context=constructArchiveSourceContext({baseFields,presetFields,sourceCurveModes,stretchCurveMode:scalar(counts.weight_curve),pitchCurveMode:scalar(cfg.pitch_edits),
 registry:{middleWeight:sw.middle_weight,gramScale:sw.gram_scale,pitchScale:cfg.registry_constants.pitch_scale,referenceNote:cfg.registry_constants.reference_note,anchorMultiplier:anchor.registry_multiplier}});
const amplitudeCurveModes=Object.fromEntries(['B25b0','B26f0','B2790','A530'].map(k=>[k,ordinary]));
const runtimeCurveModes=Object.fromEntries(['B17d8','A8a8','B1828','B1878','Ad30','B18d0'].map(k=>[k,ordinary]));
const grid=presetFields.find(r=>r.object_offset===0x9a8)?.value?.grid,baseGrid=baseFields.find(r=>r.object_offset===0x1018)?.value?.rows;
if(!grid||!baseGrid)throw new Error('Complete archive harmonic grids required');
const constants=d.constants.records[0],weightOffset=d.weightConstants.records[0].weight_offset,radius=d.radius.records[0].radius,poly=d.polynomial.records[0];
if(d.constants.records.some(r=>r.phase_constant!==constants.phase_constant||r.integer_amplitude_scale!==constants.integer_amplitude_scale)||
 d.weightConstants.records.some(r=>r.weight_offset!==weightOffset)||d.radius.records.some(r=>r.radius!==radius)||![poly.kappa,poly.gamma].every(Number.isFinite))throw new Error('Conflicting or incomplete observed registry constants');
const view=new DataView(new ArrayBuffer(8)),bits=(x,float=false)=>{if(float){view.setFloat32(0,x);return view.getUint32(0).toString(16);}view.setFloat64(0,x);return view.getBigUint64(0).toString(16);};
const failures=[],checks=[],predictions=[];let float32Values=0,doubleValues=0,indices=0;
const compare=(name,a,b,float=false)=>{if(a.length!==b.length||![...a,...b].every(Number.isFinite))throw new Error('Incomplete '+name);let mismatches=0;for(let i=0;i<a.length;i++)if(bits(a[i],float)!==bits(b[i],float)){mismatches++;if(failures.length<40)failures.push({name,index:i,predicted:a[i],actual:b[i]});}checks.push({name,values:a.length,mismatches});if(float)float32Values+=a.length;else doubleValues+=a.length;};
const usedPoles=new Set();
for(const mode of [0,1]){
 const rows=mode===0?26:10,list=d.source.records.filter(r=>r.mode===mode),norm=d.normalized.records.filter(r=>r.mode===mode);
 if(list.length!==1||norm.length!==1)throw new Error('Unique source mode required');const r=list[0],n=norm[0],c=r.cache_controls,g=r.G_controls;
 if(r.note!==69||r.note_index!==69||r.component_count!==3||r.matrices['0x10'].rows!==rows||r.matrices['0x10'].cols!==3)throw new Error('Original A4 26/10 three-column source scope required');
 const gridConfig=d.grids.configurations[`${r.note_index}:${mode}`],before=d.before.records.filter(x=>x.note_index===r.note_index&&x.cache_mode===mode);
 if(!gridConfig||before.length!==rows)throw new Error('Complete impedance runtime modes required');const phaseMode=scalar(before[0].phase_curve);
 if(before.some(x=>JSON.stringify(scalar(x.phase_curve))!==JSON.stringify(phaseMode)))throw new Error('Conflicting phase curve modes');
 const phaseNames=['globalDegrees','evenOffset','oddDegrees','evenDegrees','oddDelay','evenDelay'],phaseOffsets=['0x400','0x418','0x430','0x448','0x460','0x478'];
 const own=prepareArchiveSourceTables(context,{note:r.note,noteIndex:r.note_index,amplitudeCurveModes,instrumentMode:1,phaseCurveMode:ordinary,
  weightSource:{runtimeCurveModes,harmonicCurveModes:{preset:grid.map(()=>ordinary),base:baseGrid.map(()=>ordinary)},weightOffset},
  integerScale:constants.integer_amplitude_scale,phaseConstant:constants.phase_constant,jitterAmount:c['0x140'],sampleRate:g['0x98'],frequencyCutoff:c['0xf8'],
  polynomialControls:{kappa:poly.kappa,gamma:poly.gamma,decayFloorRatio:c['0x110']},
  impedanceRuntime:{mode,runtimeCurveMode:'linear-clamp',phaseCurveMode:phaseMode,frequencyCurveModes:gridConfig.frequency_curves.map(scalar),polarRadius:radius},
  phaseOffsetControls:Object.fromEntries(phaseNames.map((name,i)=>[name,g[phaseOffsets[i]]]))});
 if(!own.coupledPolesComputed||!own.coupledImpedanceFromArchive||!own.harmonicWeightsComputed||own.independentPolesComputed||own.rows!==rows||own.columns!==3)throw new Error('Expected complete own pure-coupled archive source');
 for(const [name,offset] of [['frequency','0x10'],['decay','0x38'],['amplitude','0x60'],['phase','0x88']])compare(`${mode}:${name}`,own[name],r.matrices[offset].values,true);
 compare(`${mode}:normalized-amplitude`,own.normalizedAmplitude,n.matrices['0x60'].values,true);
 indices++;if(own.referenceIndex!==r.reference_index||own.referenceIndex!==n.reference_index)failures.push({name:'reference-index',mode,predicted:own.referenceIndex,actual:r.reference_index});
 const raw=d.amplitude.records.filter(a=>a.frequency.rows===rows&&a.frequency.cols===3);
 if(raw.length!==1)throw new Error('Unique raw decay matrix required');
 compare(`${mode}:raw-decay`,own.coupledPoleTraces.flatMap(t=>t.rawDecay),raw[0].raw_decay.values,true);
 for(const trace of own.coupledPoleTraces){
  const captures=d.poles.records.filter(p=>p.note_index===r.note_index&&p.cache_mode===mode&&bits(p.parameters.mode,true)===bits(trace.mode,true));
  if(captures.length!==1)throw new Error('Unique original pole call required');const target=captures[0],key=`${mode}:${trace.row}`;
  if(usedPoles.has(key))throw new Error('Duplicate row');usedPoles.add(key);
  compare(key+':lambda',trace.lambda,target.lambda);
  compare(key+':coupling',[trace.center,trace.p,trace.q],[target.parameters.center,target.parameters.p,target.parameters.q]);
  if(trace.rootAlgorithm!=='recovered-native-cubic-qr')throw new Error('Independent root algorithm forbidden');
 }
 predictions.push({note:r.note,noteIndex:r.note_index,mode,rows:own.rows,cols:own.columns,columns:own.columns,frequency:Array.from(own.frequency),decay:Array.from(own.decay),amplitude:Array.from(own.amplitude),phase:Array.from(own.phase),normalizedAmplitude:Array.from(own.normalizedAmplitude),referenceIndex:own.referenceIndex});
}
if(usedPoles.size!==36)throw new Error('Incomplete 36-row coverage');
const report={schema:'pianoteq-archive-coupled-source-pass168',passed:!failures.length,float32Values,doubleValues,indices,checks,failures,predictions,sources,sourceRows:36,sourceConfigurations:2,
 rootAlgorithm:'recovered-native-cubic-qr',archivePhysicalTuningWeightsAmplitudeComputed:true,archiveImpedanceAndPolesComputed:true,
 remainingObservedInputs:['tuning/weight/phase/amplitude registry constants','instrument and scalar curve modes','sample rate, cutoff, coupling jitter, decay floor ratio','impedance polar radius and mode','G phase offsets','polynomial kappa/gamma'],
 scope:'Cross-historical complete A4 coupled source matrices; not a new same-run voice or audio capture',sameRunPresetIdentityVerified:false,newAudioRendered:false,completeVoiceVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,predictions:undefined,checks:undefined,sources:undefined}));if(!report.passed)process.exitCode=1;
