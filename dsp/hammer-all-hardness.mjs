// 0662b0..066350: finite-input arithmetic, not a full hammer-contact model.
// Nonzero-All integration still requires native voice trajectory validation.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround;
const clip=(x,lo,hi)=>x<lo?lo:x>hi?hi:x;
export function applyHammerAllHardness(groups,all){
  if(!Array.isArray(groups)||groups.length!==3||![...groups,all].every(x=>Number.isFinite(f(x))))
    throw new RangeError('Three finite float32 hardness groups and finite All required');
  groups=groups.map(f);all=clip(f(all),-1,1);
  if(all===0)return groups;
  const scale=f(all+1),t=f(f(all-0.5)*2);
  return groups.map(group=>{
    const value=clip(f(group*scale),0,2);
    return all>=0.5?fma32(f(2-value),t,value):value;
  });
}

// 066754..066780: products are clamped after multiplying each base curve.
export function clampHammerHardnessTable(values){
  if(!Array.isArray(values)||values.length!==5||!values.every(x=>Number.isFinite(f(x))))
    throw new RangeError('Five finite float32 hardness products required');
  return values.map(x=>clip(f(x),0,2));
}
