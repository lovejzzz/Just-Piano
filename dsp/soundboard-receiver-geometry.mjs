import {fma32} from './modal-kernel.mjs';
import {nativeScalarSinCos} from './native-scalar-sincos.mjs';
import {sortSoundboardObservationRecords} from './soundboard-observation-sort.mjs';
const f = Math.fround;

export function constructSoundboardReceiverGeometry({grid, shape, primary, offsets, parents, offsetScale,
  width, height, planeHeight, planeOffset, angleScale, angleDegrees, mirror}) {
  const controls=[offsetScale,width,height,planeHeight,planeOffset,angleScale,angleDegrees];
  const validPoint=p=>p instanceof Float32Array&&p.length===3&&p.every(Number.isFinite);
  if(!controls.every(v=>Number.isFinite(v)&&Number.isFinite(f(v)))||width<=0||height<=0||
    !(shape instanceof Float32Array)||shape.length!==grid.size||shape.some(v=>!Number.isFinite(v))||
    !Array.isArray(primary)||!primary.length||!primary.every(validPoint)||!Array.isArray(offsets)||
    offsets.length<primary.length||!offsets.every(validPoint)||!(parents instanceof Uint32Array)||
    parents.length!==offsets.length||parents.some(i=>i>=primary.length)||primary.length+offsets.length>64||
    ![0,1].includes(Number(mirror))) throw new RangeError('Supported finite receiver geometry inputs required');
  const originals=primary.map((p,i)=>({coordinates:p.slice(),amplitude:1,identity:i,channel:i,kind:0,serial:0}));
  offsets.forEach((offset,i)=>{
    const source=originals[parents[i]], previous=originals.at(-1);
    const serial=originals.length>primary.length&&previous.identity===source.identity?previous.serial+1:1;
    originals.push({...source,coordinates:Float32Array.from(source.coordinates,(p,j)=>fma32(f(offsetScale),offset[j],p)),
      channel:primary.length+i,serial});
  });
  const angle=f(((f(angleDegrees)*Math.PI)*f(angleScale))/180);
  const {sin,cos}=nativeScalarSinCos(angle), normal=Float32Array.of(sin,0,-cos);
  const geometry=[...originals],attenuations=[];
  for(const original of originals){
    const p=original.coordinates;
    let inside=p[0]>=0&&p[0]<=f(width)&&p[1]>=0&&p[1]<=f(height)&&
      f(fma32(grid.boundaryScale[0],p[0],f(grid.boundaryScale[1]*p[1]))-1)<=0;
    let attenuation=0;
    if(inside){
      const x=f(p[0]/grid.h),y=f(p[1]/grid.h),ix=Math.trunc(x),iy=Math.trunc(y);
      if(ix>=0&&ix<grid.nx&&iy>=0&&iy<grid.ny){
        const fx=f(f(ix+1)-x),fy=f(f(iy+1)-y),stride=grid.nx+1;
        const lower=fma32(fx,shape[iy*stride+ix],f(f(1-fx)*shape[iy*stride+ix+1]));
        const upper=fma32(fx,shape[(iy+1)*stride+ix],f(f(1-fx)*shape[(iy+1)*stride+ix+1]));
        attenuation=f(1-fma32(fy,lower,f(f(1-fy)*upper)));
      }
    }
    const projected=f(f(p[0]*sin)+f(p[1]*0));
    const z=f(f(p[2]-f(planeHeight))-f(planeOffset));
    const distance=fma32(-cos,z,projected);
    const reflected=p.slice();
    if(distance>=0){const twice=f(distance+distance);for(let j=0;j<3;j++)reflected[j]=fma32(-twice,normal[j],p[j]);}
    geometry.push({...original,coordinates:reflected,kind:1,
      amplitude:inside&&(p[2]<f(planeHeight)||distance<0)?attenuation:1});
    if(mirror)geometry.push({...original,coordinates:Float32Array.of(p[0],p[1],-p[2]),kind:2,
      amplitude:inside&&p[2]>=f(planeHeight)?attenuation:1});
    attenuations.push({inside,attenuation,planeDistance:distance});
  }
  // Within the <=64-source bound, this is an exact encoding of native keys:
  // signed kind, serial!=0, uint64 identity, signed serial. Ties retain native
  // introsort partition order through the same independent index sorter.
  const keyed=geometry.map(record=>({stateIndex:record.kind*2+Number(record.serial!==0),
    frequencyIndex:record.identity*65536+record.serial,record}));
  const sorted=sortSoundboardObservationRecords(keyed).records.map(r=>r.record);
  for(const record of sorted)if(record.serial){
    const parent=sorted.find(p=>!p.serial&&p.identity===record.identity&&p.kind===record.kind);
    if(!parent)throw new RangeError('Receiver attenuation parent missing');record.amplitude=parent.amplitude;
  }
  return {geometry:sorted,normal,angle,attenuations};
}
