// 29c430: input/output silence counters select packed-network work.
// 465540 expands inactive output matrices and clears only the newly added rows.
import {fma32} from './modal-kernel.mjs';
import {nativeScalarSin} from './native-scalar-sin.mjs';
import {spatializeVoiceGroups} from './voice-spatial-output.mjs';
const f=Math.fround,quietLimit=f(1e-7),bias=f(1e-20);
export function initializeSpatialSleep(threshold){
 if(!Number.isInteger(threshold)||threshold<1||threshold>0xffffffff)throw new Error('Uint32 spatial sleep threshold required');
 return {threshold,inputCounters:new Uint32Array(3),outputCounters:new Uint32Array(3)};
}
function finished(fade){
 const seconds=fma32(fade.secondsPerSample,f(fade.counter),-fade.start),angle=f((f(1/fade.duration)*(Math.PI/2))*seconds);
 return angle>0&&(angle>=Math.PI/2||nativeScalarSin(angle)===1);
}
export function renderSpatialWithSleep(groups,rows,fade,state){
 if(groups.length!==3||groups.some(g=>g.length!==64||!g.every(Number.isFinite))||rows.length!==3||state.inputCounters.length!==3||state.outputCounters.length!==3)throw new Error('Three aligned spatial groups required');
 const quiet=groups.map(g=>Math.max(...g.map(Math.abs))<quietLimit);
 const active=quiet.map((q,g)=>{state.inputCounters[g]=q?(state.inputCounters[g]+64)>>>0:0;return state.inputCounters[g]<state.threshold||state.outputCounters[g]<state.threshold;});
 let output;
 if(active.every(Boolean))output=spatializeVoiceGroups(groups,rows,fade);
 else{
  if(!finished(fade))throw new Error('Inactive spatial groups during fade not verified');
  if(active.some(Boolean)){
   const biased=groups.map((g,i)=>{const row=Float32Array.from(g);if(!active[i])row[0]=f(row[0]+bias);return row;});
   output=spatializeVoiceGroups(biased,rows,fade);
  }else output=groups.map(g=>[Float32Array.from(g),new Float32Array(64),new Float32Array(64)]);
 }
 output.forEach((group,g)=>{const outputQuiet=quiet[g]&&group.every(row=>Math.max(...row.map(Math.abs))<quietLimit);state.outputCounters[g]=outputQuiet?(state.outputCounters[g]+64)>>>0:0;});
 return {output,quiet,active,allInactive:!active.some(Boolean),mixed:active.some(Boolean)&&!active.every(Boolean)};
}
