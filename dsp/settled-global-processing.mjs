// Observed empty EQ and inactive room paths; active filters/ramps need other kernels.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround;
export function renderEmptyGlobalFilter(input,state){
 if(state.sections!==0||state.table.length||state.history.length||state.coefficients.length)throw new Error('Active global filter not covered');
 if(state.updating){
  if(state.level[3]!==0)throw new Error('Active EQ level ramp not covered');
  state.gain=state.level[0];state.updating=0;
 }
 return state.gain===1?Float32Array.from(input):Float32Array.from(input,v=>f(v*state.gain));
}
export function mixInactiveRoom(input,dryGains,wetGains){
 if(dryGains.length!==input.length||wetGains.length!==input.length)throw new Error('Room channel count differs');
 // Native first scales the dry matrix, then FMA-adds the zeroed wet scratch.
 return input.map((row,r)=>Float32Array.from(row,v=>{
  const dry=dryGains[r]===1?v:f(v*dryGains[r]);
  return wetGains[r]===0?dry:fma32(0,wetGains[r],dry);
 }));
}
