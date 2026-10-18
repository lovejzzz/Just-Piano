// Ordinary output kind 3; special binaural/line-output identities are rejected.
import {nativeScalarSinCos} from './native-scalar-sincos.mjs';
export function constructSoundboardMicrophoneSources(inputs, model, familyPolicy=null) {
  const output=inputs?.output;
  if(inputs?.schema!==1||output?.version!==3||output.kind!==3||output.matrix_version!==2||
    !Array.isArray(output.records)||!output.records.length||output.records.length>64||
    !Array.isArray(inputs.registry)||inputs.soloMicrophone!==0||!(model instanceof Uint8Array)||model.length!==0x340)
    throw new RangeError('Supported microphone source inputs required');
  if(output.records.some(r=>r.version!==5||![0,1].includes(r.type)))
    throw new RangeError('Unverified microphone activation type');
  const registry=new Map(inputs.registry.map(r=>[r.id,r]));
  if(registry.size!==inputs.registry.length)throw new RangeError('Duplicate microphone registry identity');
  const active=output.records.map((r,index)=>({...r,index})).filter(r=>r.type===1);
  if(!active.length)throw new RangeError('Active microphone required');
  const family=new DataView(model.buffer,model.byteOffset,model.byteLength).getUint32(0x98,true);
  if(![0,1].includes(family)||(family===1&&familyPolicy?.modelFamily!==1)||
    (familyPolicy&&familyPolicy.modelFamily!==family))
    throw new RangeError('Explicit ordinary microphone geometry policy required');
  const primary=active.map(record=>{
    if(!Array.isArray(record.position)||record.position.length!==3||
      record.position.some(v=>!Number.isFinite(v)||!Number.isFinite(Math.fround(v))))throw new RangeError('Finite microphone position required');
    const point=Float32Array.from(record.position);
    if(family===1){const y=point[1];point[1]=point[2];point[2]=-y;
      if(familyPolicy.uprightRoot)point[2]=Math.fround(familyPolicy.verticalOffset+point[2]);}
    return point;
  });
  const defaultAmount=new DataView(model.buffer,model.byteOffset,model.byteLength).getFloat32(0x1d4,true);
  if(!Number.isFinite(defaultAmount))throw new RangeError('Finite default whitening amount required');
  const amounts=new Float32Array(active.length),flags=new Uint32Array(active.length),mixes=new Float32Array(active.length);
  const curves=active.map((record,index)=>{
    if(!Number.isInteger(record.control)||record.control<0||record.control>=1000||
      !Array.isArray(record.flags)||record.flags.length!==2||record.flags.some(v=>!Number.isInteger(v)||v<0||v>0xffffffff))
      throw new RangeError('Ordinary microphone controls required');
    const entry=registry.get(record.control)??registry.get(0);
    if(!entry)throw new RangeError('Microphone registry identity unavailable');
    const c=entry.curve;
    if(![entry.amount,entry.mix].every(v=>Number.isFinite(v)&&Number.isFinite(Math.fround(v)))||
      c?.dimensions!==1||c.mode!==0||c.logX!==0||!Array.isArray(c.x)||!Array.isArray(c.y)||
      !c.x.length||c.x.length!==c.y.length||[...c.x,...c.y].some(v=>!Number.isFinite(v)||!Number.isFinite(Math.fround(v))))
      throw new RangeError('Complete ordinary microphone spectral curve required');
    const x=Float32Array.from(c.x),y=Float32Array.from(c.y);
    if(x.some((v,i)=>i&&v<=x[i-1]))throw new RangeError('Increasing microphone knots required');
    flags[index]=Number(record.flags[0]!==0);
    amounts[index]=record.control===0?defaultAmount:flags[index]?0:entry.amount;
    mixes[index]=entry.mix;
    return {x,y,dimensions:1,mode:0,logX:0};
  });
  const offsets=active.map(record=>{
    if(!Array.isArray(record.angles)||record.angles.length!==2||
      record.angles.some(v=>!Number.isFinite(v)||!Number.isFinite(Math.fround(v))))throw new RangeError('Finite microphone angles required');
    const azimuth=Math.fround((Math.fround(record.angles[0])*Math.PI)/180+Math.PI/2);
    const elevation=Math.fround((Math.fround(record.angles[1])*Math.PI)/180);
    const vertical=nativeScalarSinCos(elevation),horizontal=nativeScalarSinCos(azimuth);
    const point=Float32Array.of(Math.fround(vertical.cos*horizontal.cos),Math.fround(vertical.cos*horizontal.sin),vertical.sin);
    if(family===1){const y=point[1];point[1]=point[2];point[2]=-y;}
    return point;
  });
  const parents=Uint32Array.from(active,(_,i)=>i);
  return {amounts,flags,mixes,curves,primary,offsets,parents,indices:active.map(r=>r.index),identities:active.map(r=>r.control),
    nativeRuntimeCurvesUsedForConstruction:false};
}
