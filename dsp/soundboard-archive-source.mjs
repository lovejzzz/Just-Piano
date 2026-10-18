// Rebuild the named scalar/curve source views used by the independent engine.
// Sparse views contain no native pointers and are not native object replicas.
export function constructSoundboardArchiveSources(archive){
 if(archive?.schema!==1||archive.baseVersion!==89||archive.soundboards?.version!==1||
   !Array.isArray(archive.soundboards.filters)||!archive.soundboards.filters.length||archive.soundboards.filters.length>64||
   !Array.isArray(archive.presetFields))throw new RangeError('Complete supported soundboard archive inputs required');
 const fields=new Map(archive.presetFields.map(r=>[r.object_offset,r]));
 if(fields.size!==archive.presetFields.length)throw new RangeError('Duplicate preset source field');
 const preset=new Uint8Array(0x1840),p=new DataView(preset.buffer),presetOffsets=[0xf98,0x1018,0x1020,0x1024];
 for(const offset of presetOffsets){const row=fields.get(offset);if(!row||!Number.isFinite(row.value))throw new RangeError('Missing preset source scalar');
  if(offset===0x1024){if(row.kind!=='u32'||![0,1].includes(row.value))throw new RangeError('Supported lid enable field required');p.setUint32(offset,row.value,true);}
  else {if(row.kind!=='f32'||!Number.isFinite(Math.fround(row.value)))throw new RangeError('Finite float32 preset scalar required');p.setFloat32(offset,row.value,true);}}
 const array=(values,length,label)=>{
  if(!Array.isArray(values)||(length!==null&&values.length!==length)||values.some(v=>!Number.isFinite(v)||!Number.isFinite(Math.fround(v))))throw new RangeError(`Complete ${label} required`);
  return Float32Array.from(values);
 };
 const curve=(source,dimensions,label)=>{
  if(source?.version!==32771||!Array.isArray(source.indices)||source.indices.length)throw new RangeError(`Unverified ${label} curve mode/version`);
  const x=array(source.x,null,label+' x'),y=array(source.y,Math.max(1,x.length)*dimensions,label+' y');
  if(x.some((v,i)=>i&&v<=x[i-1]))throw new RangeError('Increasing curve knots required');
  return {x,y,dimensions,mode:0,logX:0};
 };
 const components=archive.soundboards.filters.map((record,index)=>{
  if(record.version!==9||record.flag100!==1||record.child108?.version!==5||record.mode!==0||
    !Number.isInteger(record.mode9c)||record.mode9c<0||record.mode9c>0xffffffff||record.curves?.length!==3)throw new RangeError('Supported direct soundboard component required');
  const child=record.child108,scalars=array(record.scalars,6,'component geometry'),primary=array(child.scalars20,13,'propagation scalars');
  const tail=array(child.scalars70,4,'child controls'),shaping=array(child.scalarsd4,3,'shaping scalars');
  const bridge=array(child.vector8,4,'bridge'),propagationModes=array(child.vector58,3,'propagation modes');
  const globalCurve=curve(child.curve78,1,'global shaping'),lidCurve=curve(record.curves[2],3,'lid gain');
  const model=new Uint8Array(0x340),m=new DataView(model.buffer),modelOffsets=[];
  const set=(offset,value,integer=false)=>{if(integer)m.setUint32(offset,value,true);else{value=Math.fround(value);if(!Number.isFinite(value))throw new RangeError('Finite model scalar required');m.setFloat32(offset,value,true);}modelOffsets.push(offset);};
  scalars.forEach((v,i)=>set(0x50+i*4,v));set(0x98,record.mode,true);set(0x9c,record.mode9c,true);set(0x100,record.flag100,true);
  set(0x108,child.scalar0);primary.forEach((v,i)=>set(0x128+i*4,v));
  set(0x178,tail[0]);set(0x1d0,tail[1]);set(0x1d4,tail[2]);set(0x1d8,tail[3]);
  shaping.forEach((v,i)=>set(0x1dc+i*4,v));set(0x1c8,globalCurve.dimensions,true);
  // Ordinary archive version 32771: native log-X and special bytes are zero.
  const modelBytes=[0x1cc,0x1cd];
  return {index,model,preset:preset.slice(),modelOffsets:modelOffsets.sort((a,b)=>a-b),modelBytes,presetOffsets,
    bridge,propagationModes,lidCurve,globalCurve,nativePointerLayoutRecreated:false};
 });
 return {components,archiveSources:true,nativeModelOrPresetSnapshotsUsedForConstruction:false,fullNativeRecordsRecreated:false};
}
