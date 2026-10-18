// Archive pitch curves + explicit velocity-producer controls + own source decay.
// Main caller takes reference decay from its own merged source table.
import {archivePitchSourceControls,velocityScaleFromControls} from './pitch-source-controls.mjs';
import {nativeScalarLogf} from './native-scalar-log.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
const f=Math.fround;
export function archiveVoicePitchControls({baseFields,note,velocity,velocityControls,runtimeCurveMode,sourceReferenceDecay,sampleRate,zeroCentsRuntimeBranchExplicit}){
 if(!Array.isArray(baseFields)||!velocityControls||'host78' in velocityControls||'host80' in velocityControls||
   ![velocity,sourceReferenceDecay,sampleRate].every(x=>Number.isFinite(x)&&Number.isFinite(f(x)))||
   zeroCentsRuntimeBranchExplicit!==true||velocity<0||velocity>1||f(sourceReferenceDecay)<=0||f(sampleRate)<=0||!Number.isFinite(f(1/f(sampleRate)))||runtimeCurveMode!=='linear-clamp')
  throw new RangeError('Archive fields, own velocity/reference decay and explicit supported producer conditions required');
 const scaled=velocityScaleFromControls({...velocityControls,host78:velocity,runtimeCurveMode},
  {logf:nativeScalarLogf,expf:nativeScalarExp});
 const source=archivePitchSourceControls({baseFields,note,host78:velocity,host80:scaled.velocityScale,runtimeCurveMode});
 if(!source.exponentialBranch)throw new RangeError('Archive voice trajectory currently supports the exponential branch');
 return {controls:{timestep:f(1/f(sampleRate)),centsA:0,centsB:0,strength:source.strength,
  relaxation:source.decay,velocityScale:source.velocityScale,modalDecay:f(sourceReferenceDecay),
  exponentialBranch:true,released:false,releaseRule:false,damperFlag:false,releaseAmount:0,smoothedRatio:1},
  source,velocity:scaled,zeroCentsRuntimeBranchExplicit:true,velocityProducerControlsExplicit:true,
  referenceDecayFromOwnSource:true,completeVoiceVerified:false};
}
