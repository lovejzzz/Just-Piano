// Inspected post-route three-row feedback injected into three three-row voice groups.
import {fma32} from './modal-kernel.mjs';
export function injectWorkspaceFeedback(groups,feedback,gain){
 if(groups.length!==3||groups.some(g=>g.length!==3||g.some(row=>row.length!==64))||feedback.length!==3||feedback.some(row=>row.length!==64)||!Number.isFinite(gain))throw new Error('Unverified workspace feedback shape');
 const mixed=groups.map(group=>group.map((row,j)=>gain===0?Float32Array.from(row):Float32Array.from(row,(x,i)=>fma32(feedback[j][i],gain,x))));
 return {groups:mixed,flat:mixed.flat()};
}
