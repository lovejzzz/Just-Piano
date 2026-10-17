// 547f74 samples each curve on integer harmonic coordinates, then adds grid
// interpolation into an existing row. 487db4 adds global edits, base grid,
// clamps +/-192 dB and appends a zero terminator when needed.
import {linearModelCurve} from './model-curves.mjs';
import {fma32} from './modal-kernel.mjs';
const f=Math.fround,view=new DataView(new ArrayBuffer(8));
view.setBigUint64(0,0x39b4484bfeebc2a0n);const tinySpacing=view.getFloat64(0);
const field=(fields,offset)=>{const r=fields?.find(r=>r.object_offset===offset);if(!r)throw new RangeError('Missing harmonic archive field');return r.value;};
export function addHarmonicGrid({rows,note,initial=[],runtimeCurveModes}) {
  if(!Array.isArray(rows)||!Number.isFinite(f(note))||!Array.isArray(initial)||!initial.every(x=>Number.isFinite(f(x))))
    throw new RangeError('Finite harmonic grid inputs required');
  note=f(note);const output=initial.map(f);
  if(!rows.length)return {values:output,selection:null};
  if(!Array.isArray(runtimeCurveModes)||runtimeCurveModes.length!==rows.length)
    throw new RangeError('Explicit runtime modes for every harmonic grid row required');
  const sampled=rows.map((row,i)=>{
    const c=row.curve,m=runtimeCurveModes[i];
    if(!Number.isFinite(f(row.coordinate))||(i&&!(f(row.coordinate)>f(rows[i-1].coordinate)))||
       !m||m.flags!==0||m.special!==0||m.dimension!==1||!Array.isArray(c?.x)||!Array.isArray(c.y)||
       c.x.length!==c.y.length||![...c.x,...c.y].every(x=>Number.isFinite(f(x))))
      throw new RangeError('Increasing grid and ordinary scalar harmonic curves required');
    if(!c.y.length)return [];
    if(f(c.x[0])!==0)throw new RangeError('Supported harmonic curves start at coordinate zero');
    const count=Math.trunc(f(f(c.x.at(-1))+1));
    if(count<1||count>16384)throw new RangeError('Unsupported harmonic sampling extent');
    return Array.from({length:count},(_,j)=>linearModelCurve(c,f(j),{runtimeMode:'linear-clamp'})[0]);
  });
  const add=(values,scale)=>{
    while(output.length<values.length)output.push(0);
    for(let i=0;i<values.length;i++)output[i]=scale===undefined?f(output[i]+values[i]):fma32(scale,values[i],output[i]);
  };
  let selection;
  if(note<f(rows[0].coordinate)||rows.length===1){add(sampled[0]);selection={left:0,right:0};}
  else if(note>=f(rows.at(-1).coordinate)){add(sampled.at(-1));selection={left:rows.length-1,right:rows.length-1};}
  else {
    let left=0;while(note>f(rows[left+1].coordinate))left++;
    const spacing=f(f(rows[left+1].coordinate)-f(rows[left].coordinate));
    const alpha=spacing>tinySpacing?f(f(note-f(rows[left].coordinate))/spacing):1;
    add(sampled[left],f(1-alpha));add(sampled[left+1],alpha);
    selection={left,right:left+1,alpha};
  }
  return {values:output,selection};
}
export function archiveHarmonicEdits({baseFields,presetFields,note,runtimeCurveModes}) {
  if(!Number.isFinite(f(note))||note<0||note>127)throw new RangeError('Finite note coordinate required');
  if(field(baseFields,0x158)===5)throw new RangeError('Type-5 harmonic transformation is not implemented');
  const control=field(presetFields,0x9a8),base=field(baseFields,0x1018);
  if(control?.version!==10||!Array.isArray(control.grid)||!Array.isArray(control.vector)||control.vector.length!==8||
     !control.vector.every(x=>Number.isFinite(f(x)))||!Array.isArray(base?.rows))
    throw new RangeError('Decoded A9a8 v10 and B1018 harmonic grids required');
  const preset=addHarmonicGrid({rows:control.grid.map(r=>({coordinate:r.scalar,curve:r.curve})),note,runtimeCurveModes:runtimeCurveModes?.preset});
  const combined=preset.values.slice();
  while(combined.length<control.vector.length)combined.push(0);
  for(let i=0;i<control.vector.length;i++)combined[i]=f(combined[i]+f(control.vector[i]));
  const model=addHarmonicGrid({rows:base.rows,note,initial:combined,runtimeCurveModes:runtimeCurveModes?.base});
  const values=model.values.map(x=>Math.min(192,Math.max(-192,x)));
  if(values.length&&values.at(-1)!==0)values.push(0);
  return {values,presetSelection:preset.selection,baseSelection:model.selection,harmonicEditsComputed:true,
    runtimeCurveModesExplicit:true,nativeFullVoiceVerified:false};
}
