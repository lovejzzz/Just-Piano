// Reconstructed 460110 tail and 2a2910 packed five-tap spatial network.
import { fma32 } from './modal-kernel.mjs';
import { nativeScalarSin } from './native-scalar-sin.mjs';
const f = Math.fround;

export function combineThenRestoreGroups(groups) {
  const combined = Float32Array.from(groups[0]);
  for (const group of groups.slice(1)) {
    for (let i=0;i<combined.length;i++) combined[i]=f(combined[i]+group[i]);
  }
  const restored = Float32Array.from(combined);
  for (const group of groups.slice(1)) {
    for (let i=0;i<restored.length;i++) restored[i]=fma32(-1,group[i],restored[i]);
  }
  return { combined, groups:[restored,...groups.slice(1).map(g=>Float32Array.from(g))] };
}

export function renderPackedFiveTap(input, state) {
  if (input.length%4 || state.taps.length!==5 || state.ring.length!==state.vectors*4 ||
      state.vectors<1 || (state.vectors & (state.vectors-1))) throw new Error('Unverified packed network shape');
  const [t0,t1,t2,t3,t4]=state.taps;
  const mask=state.vectors-1;
  const output=new Float32Array(input.length);
  const p=-f(t1.c*t0.c), q=-f(t1.c*t0.g), m=f(t1.g*t0.c), n=f(t0.g*t1.g);
  for(let sample=0;sample<input.length/4;sample++) {
    const at=(state.counter+sample)>>>0;
    const indices=[at&mask,(at-t0.end)&mask,(at+t1.start-t1.end)&mask,
      (at+t2.start-t2.end)&mask,(at+t2.start-t2.end+t3.start-t3.end)&mask,
      (at+t2.start-t2.end+t3.start-t3.end+t4.start-t4.end)&mask];
    // Native loads all five vectors before any ring write.
    const a=state.ring.slice(indices[1]*4,indices[1]*4+4);
    const b=state.ring.slice(indices[2]*4,indices[2]*4+4);
    const c=state.ring.slice(indices[3]*4,indices[3]*4+4);
    const d=state.ring.slice(indices[4]*4,indices[4]*4+4);
    const e=state.ring.slice(indices[5]*4,indices[5]*4+4);
    for(let lane=0;lane<4;lane++) {
      const x=input[sample*4+lane];
      const first=fma32(-t0.c,x,a[lane]);
      const intermediate=fma32(t1.c,b[lane],fma32(n,x,f(a[lane]*m)));
      const ringB=f(b[lane]+fma32(q,x,f(a[lane]*p)));
      const ringAt=fma32(t2.c,c[lane],f(intermediate*t2.g));
      const second=fma32(-t2.c,intermediate,c[lane]);
      const ringC=fma32(t3.c,d[lane],f(second*t3.g));
      const third=fma32(-t3.c,second,d[lane]);
      const ringD=fma32(t4.c,e[lane],f(third*t4.g));
      const ringE=fma32(-t4.c,third,e[lane]);
      output[sample*4+lane]=first;
      state.ring[indices[1]*4+lane]=first;
      state.ring[indices[2]*4+lane]=ringB;
      state.ring[indices[0]*4+lane]=ringAt;
      state.ring[indices[3]*4+lane]=ringC;
      state.ring[indices[4]*4+lane]=ringD;
      state.ring[indices[5]*4+lane]=ringE;
    }
  }
  state.counter=(state.counter+input.length/4)>>>0;
  return output;
}

export function spatializeVoiceGroups(groups, rows, fade) {
  if(groups.length>4 || !groups.length || groups.some(g=>g.length!==groups[0].length)) throw new Error('Invalid packed voice groups');
  const count=groups[0].length;
  const packed=new Float32Array(count*4);
  groups.forEach((g,lane)=>g.forEach((v,i)=>{packed[i*4+lane]=v;}));
  const wet=rows.map(state=>renderPackedFiveTap(packed,state));
  const result=groups.map((_,g)=>wet.map(row=>Float32Array.from({length:count},(_,i)=>row[i*4+g])));
  const reciprocal=f(1/fade.duration);
  for(let sample=0;sample<count;sample++) {
    const seconds=fma32(fade.secondsPerSample,f(fade.counter),-fade.start);
    const angle=f((reciprocal*(Math.PI/2))*seconds);
    let mix=0;
    if(angle>0) {
      mix=nativeScalarSin(angle);
      if(angle>=Math.PI/2 || mix===1) break;
    }
    const dry=f(1-mix);
    for(let g=0;g<groups.length;g++) {
      const original=f(dry*groups[g][sample]);
      for(let row=0;row<rows.length;row++) result[g][row][sample]=fma32(mix,result[g][row][sample],original);
    }
    fade.counter=(fade.counter+1)>>>0;
  }
  return result;
}

export function distributeAuxiliary(primaryRows, auxiliaryRows, fraction, nonlinearity=0) {
  if(primaryRows.length!==auxiliaryRows.length) throw new Error('Mismatched auxiliary rows');
  const keep=f(1-fraction);
  const primary=primaryRows.map(row=>Float32Array.from(row));
  const auxiliary=auxiliaryRows.map(row=>Float32Array.from(row));
  for(let row=0;row<primary.length;row++) {
    if(primary[row].length!==auxiliary[row].length) throw new Error('Mismatched auxiliary samples');
    for(let i=0;i<primary[row].length;i++) {
      const value=auxiliaryRows[row][i];
      primary[row][i]=fma32(value,fraction,primary[row][i]);
      const retained=f(value*keep);
      auxiliary[row][i]=nonlinearity ? fma32(retained,f(retained*nonlinearity),retained) : retained;
    }
  }
  return {primary,auxiliary};
}
