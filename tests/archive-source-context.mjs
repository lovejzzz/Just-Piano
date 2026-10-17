import assert from 'node:assert/strict';
import {constructArchiveSourceContext,archiveSourceContextAudit,archiveTunedNote,archiveNoteSourceInputs,prepareArchiveIndependentTables,prepareArchiveSourceTables,archiveNoteWeightControls,archiveNoteSourceWeights} from '../dsp/archive-source-context.mjs';
const scalar={flags:0,special:0,dimension:1},curve=x=>({x:[0,127],y:[x,x]}),field=(object_offset,value)=>({object_offset,value});
const physicalNames=['B1b40','B1b98','B2560','A490','A4e0','Af48'];
const sourceCurveModes=Object.fromEntries(physicalNames.map(k=>[k,scalar]));
const model={indexmap:Array(128).fill(2),vectors:[[1],[1],[1]],scalar9d:0,curves:Array.from({length:10},()=>curve(0))};model.curves[0]=curve(1);
const impedance={scalars:[1,0],scalar154:3000,curves:[curve(1),curve(1),curve(1),curve(0)],curves248:[curve(1),curve(1),curve(1)],scalar148:0,
 vectors:[[],[]],curve_list478:{coordinates:[0],curves:[{x:[],y:[0]}]}};
const baseFields=[field(0x2548,model),field(0x1b40,{x:[],y:[]}),field(0x1b98,curve(0)),field(0x14e0,10),field(0x1b30,60),field(0x1b24,0),field(0x1b3c,1),
 field(0x1b38,0),field(0x1b2c,0),field(0x1bf8,[0,127]),field(0x1d30,[0,0,0,0]),field(0x1b34,440),field(0x1be8,0),
 field(0x1c28,Array.from({length:127},()=>[1,1,1])),field(0x1c40,Array.from({length:127},()=>[1,2,3])),field(0x1c58,Array(127).fill(1)),field(0x1bec,0),
 field(0x2a38,impedance),field(0x1d48,[2,2]),field(0x1d18,[1,1]),field(0x1d60,[0,0])];
baseFields.push(field(0x164,3000));model.curves[6]=curve(1e6);
const presetFields=[field(0x1398,0),field(0xf40,10),field(0xf48,curve(1)),field(0x470,{a:1,b:1,c:0,curves_ab:[curve(1),curve(0)],curve_c:curve(0)}),
 field(0x318,{kind:1,controls:[1,0],values:Array.from({length:12},(_,i)=>(i+1)*100),midi:{float:440,flag:70,notes:[60,69],map:[]}}),
 field(0x3b0,curve(0)),field(0x46c,0),field(0x458,0),field(0x400,{index:12,curve:curve(1)}),field(0x588,{curves:[curve(1),curve(1),curve(1)],scalars:[1,1,1]})];
baseFields.push(field(0x158,0),field(0x1018,{rows:[]}),field(0x18d0,curve(0)),field(0x1c88,Array(127).fill(1)),field(0x1ca0,Array(127).fill(0)),field(0x17d8,curve(1)),field(0x1828,curve(10000)),field(0x1878,curve(2000)),field(0x18c8,0));
presetFields.push(field(0x9a8,{version:10,vector:Array(8).fill(0),grid:[]}),field(0xd80,1),field(0xd30,curve(0)),field(0x8a0,1),field(0x8a8,curve(1)),field(0x1024,1),field(0x1020,1));
const weightArgs={note:69,runtimeCurveModes:Object.fromEntries(['B17d8','A8a8','B1828','B1878','Ad30','B18d0'].map(k=>[k,scalar]))};
const args={baseFields,presetFields,sourceCurveModes,stretchCurveMode:scalar,pitchCurveMode:scalar,
 registry:{middleWeight:2,gramScale:1,pitchScale:1,referenceNote:69,anchorMultiplier:1}};
assert.throws(()=>constructArchiveSourceContext({...args,registry:undefined}));
assert.throws(()=>constructArchiveSourceContext({...args,sourceCurveModes:{}}));
const context=constructArchiveSourceContext(args),audit=archiveSourceContextAudit(context);
assert.equal(audit.stiffnessTable.length,128);assert.ok(audit.stiffnessTable.every(x=>x===0));assert.equal(audit.stretchTable.length,128);
assert.deepEqual(archiveNoteWeightControls(context,weightArgs).controls,{s0:1,s1:1,s2:10000,s3:2000});
presetFields.find(x=>x.object_offset===0x8a0).value=2;
assert.equal(archiveNoteWeightControls(context,weightArgs).controls.s1,1);
const weightSourceArgs={...weightArgs,harmonicEdits:[0],weightOffset:0};
const computedWeightSourceArgs={...weightArgs,harmonicCurveModes:{preset:[],base:[]},weightOffset:0};
assert.equal(archiveNoteSourceWeights(context,computedWeightSourceArgs).harmonicEditsComputed,true);
const originalWeights=archiveNoteSourceWeights(context,weightSourceArgs);
assert.deepEqual(originalWeights.output,[1,1,1]);
presetFields.find(x=>x.object_offset===0xd30).value=curve(6);
assert.deepEqual(archiveNoteSourceWeights(context,weightSourceArgs).output,originalWeights.output);
const first=archiveTunedNote(context,{note:69});assert.ok(Math.abs(first.frequency-440)<.001);
const amplitudeCurveModes=Object.fromEntries(['B25b0','B26f0','B2790','A530'].map(k=>[k,scalar]));
const noteArgs={note:69,amplitudeCurveModes,instrumentMode:1,phaseCurveMode:scalar};
const note=archiveNoteSourceInputs(context,noteArgs);assert.equal(note.prepared.blend,0);assert.equal(note.physical.stiffness,0);
assert.deepEqual(Array.from(note.modal.coordinates),[1,2,3]);assert.equal(note.harmonicWeightsComputed,false);
const tables=prepareArchiveIndependentTables(context,{...noteArgs,weights:[1,1,1],integerScale:1,phaseConstant:Math.PI,jitterAmount:0,sampleRate:48000,frequencyCutoff:2000,
 impedanceRuntime:{mode:0,runtimeCurveMode:'linear-clamp',phaseCurveMode:scalar,frequencyCurveModes:[scalar],polarRadius:1}});
const spectrumTables=prepareArchiveIndependentTables(context,{...noteArgs,weightSource:computedWeightSourceArgs,integerScale:1,phaseConstant:Math.PI,jitterAmount:0,sampleRate:48000,frequencyCutoff:2000,
 impedanceRuntime:{mode:0,runtimeCurveMode:'linear-clamp',phaseCurveMode:scalar,frequencyCurveModes:[scalar],polarRadius:1}});
assert.equal(spectrumTables.archiveSpectrumComputed,true);
assert.equal(spectrumTables.harmonicWeightsComputed,true);
assert.equal(spectrumTables.harmonicEditsExplicit,false);
assert.deepEqual(spectrumTables.normalizedAmplitude,tables.normalizedAmplitude);
assert.deepEqual(spectrumTables.frequency,tables.frequency);
assert.throws(()=>prepareArchiveIndependentTables(context,{...noteArgs,weights:[1,1,1],weightSource:weightSourceArgs,integerScale:1,phaseConstant:Math.PI,impedanceRuntime:{}}),/not both/);
assert.equal(tables.independentPolesComputed,true);assert.equal(tables.independentImpedanceFromArchive,true);assert.equal(tables.archiveTuningComputed,true);
assert.equal(tables.archivePhysicalSourceComputed,true);assert.equal(tables.archiveAmplitudeSourceComputed,true);assert.equal(tables.rows,3);
assert.ok([...tables.normalizedAmplitude].every(Number.isFinite));assert.equal(tables.completeCacheVerified,false);
// Tables and original model/preset objects are snapshots, not context setters.
audit.stretchTable[69]=1;audit.stiffnessTable[69]=100;
presetFields.find(x=>x.object_offset===0x3b0).value=curve(1200);
model.scalar9d=1;
assert.deepEqual(archiveTunedNote(context,{note:69}),first);
assert.equal(archiveNoteSourceInputs(context,noteArgs).modal.blend,0);
assert.notEqual(archiveSourceContextAudit(context).stretchTable[69],1);
const originals=Object.fromEntries(['pow','exp','log','log2','sin','cos','tan'].map(k=>[k,Math[k]]));
let changed,changedNote;
try{
 for(const k of Object.keys(originals))Math[k]=()=>{throw new Error('JS transcendental fallback forbidden');};
 changed=constructArchiveSourceContext(args);changedNote=archiveTunedNote(changed,{note:69});
}finally{Object.assign(Math,originals);}
assert.equal(archiveNoteWeightControls(changed,weightArgs).controls.s1,2);
assert.ok(archiveNoteSourceWeights(changed,weightSourceArgs).output[0]>1.99);
assert.equal(changedNote.frequency,Math.fround(first.frequency*2));
assert.throws(()=>prepareArchiveIndependentTables(changed,{...noteArgs,weights:[1,1,1],integerScale:1,phaseConstant:Math.PI}));
assert.throws(()=>archiveSourceContextAudit({...context}));
assert.throws(()=>archiveTunedNote(context,{note:69,noteIndex:68}));
// Exercise the general archive constructor with actual coupled and mixed
// selections, retaining the old independent-only guard.
for(const blend of [1,.5]){
 const nativeArgs=structuredClone(args),nativeModel=nativeArgs.baseFields.find(x=>x.object_offset===0x2548).value;
 nativeModel.scalar9d=blend;nativeArgs.baseFields.find(x=>x.object_offset===0x1d30).value=[-.2,.2,-.2,.2];
 const nativeContext=constructArchiveSourceContext(nativeArgs);
 const options={...noteArgs,weightSource:computedWeightSourceArgs,integerScale:1,phaseConstant:Math.PI,jitterAmount:0,sampleRate:48000,frequencyCutoff:3000,
  polynomialControls:{kappa:Math.PI,gamma:0,decayFloorRatio:1e6},
  impedanceRuntime:{mode:0,runtimeCurveMode:'linear-clamp',phaseCurveMode:scalar,frequencyCurveModes:[scalar],polarRadius:1}};
 const nativeTables=prepareArchiveSourceTables(nativeContext,options);
 const {jitterAmount,frequencyCutoff,polynomialControls,...runtimeOptions}=options;
 const ownRuntime=prepareArchiveSourceTables(nativeContext,{...runtimeOptions,sourceRuntimeCurveMode:scalar,polynomialControls:{kappa:Math.PI,gamma:0}});
 assert.equal(ownRuntime.archiveRuntimeControlsComputed,true);assert.equal(ownRuntime.runtimeSourceControls.frequencyCutoff,3000);
 for(const name of ['frequency','decay','amplitude','phase','normalizedAmplitude'])assert.deepEqual(ownRuntime[name],nativeTables[name]);
 assert.throws(()=>prepareArchiveSourceTables(nativeContext,{...options,sourceRuntimeCurveMode:scalar}),/cannot mix/);
 assert.equal(nativeTables.coupledPolesComputed,true);assert.equal(nativeTables.coupledImpedanceFromArchive,true);
 assert.equal(nativeTables.independentPolesComputed,blend<1);assert.equal(nativeTables.archiveSpectrumComputed,true);assert.equal(nativeTables.harmonicWeightsComputed,true);
 assert.equal(nativeTables.columns,2);assert.ok(nativeTables.rows>0);assert.ok([...nativeTables.normalizedAmplitude].every(Number.isFinite));
 assert.throws(()=>prepareArchiveIndependentTables(nativeContext,options),/requires a coupled endpoint/);
 assert.throws(()=>prepareArchiveSourceTables(nativeContext,{...options,polynomialControls:undefined}),/polynomial/);
}
console.log('Own stiffness/stretch/tuning context, archive-to-independent tables, pitch edits, snapshot isolation and unsupported branch guards passed.');
