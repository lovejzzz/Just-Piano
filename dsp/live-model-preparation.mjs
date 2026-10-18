// Input-only experimental realtime bridge. No native state/control/dispatch or
// rendered note audio is accepted. Defaults below are explicit research choices.
import {constructArchiveSourceContext,prepareArchiveSourceTables} from './archive-source-context.mjs';
import {archiveCouplingGrid} from './coupling-inputs.mjs';
import {archiveModalDampingProfile} from './modal-damping-profile.mjs';
import {initialModalGroup} from './modal-initial.mjs';
import {generateAuxiliaryBank} from './auxiliary-generated-bank.mjs';
const f=Math.fround;
export async function prepareLiveModel({baseFields,presetFields,sampleRate,onProgress=()=>{}}){
 if(sampleRate!==48000||!Array.isArray(baseFields)||!Array.isArray(presetFields))throw new RangeError('Private model/preset archive and 48kHz realtime context required');
 const scalar={flags:0,special:0,dimension:1},modes=names=>Object.fromEntries(names.map(name=>[name,scalar]));
 const context=constructArchiveSourceContext({baseFields,presetFields,
  sourceCurveModes:modes(['B1b40','B1b98','B2560','A490','A4e0','Af48']),stretchCurveMode:scalar,pitchCurveMode:scalar,
  registry:{middleWeight:2,gramScale:1,pitchScale:1,referenceNote:69,anchorMultiplier:1}});
 const options={instrumentMode:1,phaseCurveMode:scalar,amplitudeCurveModes:modes(['B25b0','B26f0','B2790','A530']),
  weightSource:{runtimeCurveModes:modes(['B17d8','A8a8','B1828','B1878','Ad30','B18d0']),weightOffset:0,
   harmonicCurveModes:{preset:presetFields.find(r=>r.object_offset===0x9a8).value.grid.map(()=>scalar),base:baseFields.find(r=>r.object_offset===0x1018).value.rows.map(()=>scalar)}},
  integerScale:1,phaseConstant:Math.PI,sampleRate,sourceRuntimeCurveMode:scalar,polynomialControls:{kappa:Math.PI,gamma:0},
  impedanceRuntime:{mode:0,runtimeCurveMode:'linear-clamp',phaseCurveMode:scalar,frequencyCurveModes:archiveCouplingGrid(baseFields).curves.map(()=>scalar),polarRadius:1},
  phaseOffsetControls:{globalDegrees:0,evenOffset:0,oddDegrees:0,evenDegrees:0,oddDelay:0,evenDelay:0}};
 const notes=[];
 for(let note=21;note<=108;note++){
  const source=prepareArchiveSourceTables(context,{...options,note});
  const n=Math.ceil(source.frequency.length/16)*16,frequency=new Float32Array(n),decay=new Float32Array(n),P=new Float32Array(n),Q=new Float32Array(n),cosine=new Float32Array(n);
  for(let i=0;i<n;i+=4){
   const freq=Float32Array.from({length:4},(_,j)=>source.frequency[i+j]??440);
   const amplitude=Float32Array.from({length:4},(_,j)=>source.frequency[i+j]<sampleRate*.46?source.normalizedAmplitude[i+j]:0);
   const phase=Float32Array.from({length:4},(_,j)=>source.phase[i+j]??0);
   const init=initialModalGroup({frequency:freq,pitchAdjustment:new Float32Array(4),amplitude,phase,timestep:f(1/sampleRate),pitch:1,adjustmentRatio:1,inputMode:0});
   frequency.set(freq,i);P.set(init.P,i);Q.set(init.Q,i);cosine.set(init.cosTheta,i);
   for(let j=0;j<4;j++)decay[i+j]=source.decay[i+j]??1;
  }
  if(![frequency,decay,P,Q,cosine].every(a=>a.every(Number.isFinite)))throw new Error(`Nonfinite model note ${note}`);
  notes.push({note,columns:source.columns,frequency,decay,P,Q,cosine,damping:archiveModalDampingProfile({baseFields,note})});
  onProgress({stage:'modal',completed:note-20,total:88});
  if(note%8===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 const group=baseFields.find(r=>r.object_offset===0x1e80).value.find(g=>g.integer20===1);
 onProgress({stage:'wavelets',completed:0,total:1});
 const bank=[...generateAuxiliaryBank(group).values()];
 return {schema:'just-piano-live-research-v1',sampleRate,notes,bank,
  inputContract:'model-preset-only',nativeSnapshotsUsed:false,renderedNoteAudioUsed:false,
  nativeFullVoiceEquivalent:false,adaptation:'Primary archive modal source and generated wavelets; experimental velocity/hammer, damper, scheduling and mix bridge'};
}
