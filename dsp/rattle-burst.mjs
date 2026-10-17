// 30bd30 component, verified on captured 48 kHz A4 cases.
// Caller audio and shared input table remain observed; this is not a full voice.
import {fma32} from './modal-kernel.mjs';
import {nativeScalarLog10f} from './native-scalar-log10.mjs';
import {designReleaseFilter} from './release-filter-design.mjs';
const f=Math.fround;

export function initializeRattleBurst(controls,source,poolSize){
 if(!Number.isInteger(poolSize)||poolSize<1||poolSize>128||source.length>131072||!source.every(Number.isFinite)||!Object.values(controls).every(Number.isFinite)||controls.period<=0||controls.sampleRate<=0)throw new Error('Finite Rattle burst configuration required');
 return {controls:Object.fromEntries(Object.entries(controls).map(([k,v])=>[k,f(v)])),source:Float32Array.from(source),elapsed:0,peak:0,floor:0,level:0,head:0,active:0,slots:Array.from({length:poolSize},()=>({coefficients:new Float32Array(5),history:new Float32Array(4),cursor:0,gain:0,valid:false}))};
}

function filterSample(slot,x){
 const c=slot.coefficients,h=slot.history;
 let y=f(c[2]*h[0]);
 y=fma32(x,c[4],y);y=fma32(c[0],h[1],y);
 y=fma32(c[3],h[2],y);y=fma32(c[1],h[3],y);
 h[1]=h[0];h[0]=x;h[3]=h[2];h[2]=y;
 return y;
}

export function renderRattleBurst(input,control,state){
 if(input.length!==64||!input.every(Number.isFinite)||!Number.isFinite(control)||control<0||control>1)throw new Error('Verified finite Rattle block/control required');
 const output=Float32Array.from(input),births=[],c=state.controls;control=f(control);
 if(control===0&&state.active===0){state.elapsed=0;state.peak=0;return {output,births};}
 if(!state.source.length)throw new Error('Observed source table required before active processing');
 const square=f(control*control);
 for(let sample=0;sample<input.length;sample++){
  state.elapsed=f(state.elapsed+1);state.peak=Math.max(state.peak,Math.abs(f(input[sample])));
  if(state.elapsed>=c.period&&state.elapsed<f(c.period+1)){
   state.floor=Math.max(state.floor,state.peak);
   if(control>0&&state.floor*1e-6<state.peak){
    const product=f(control*state.peak);
    const target=product===0?-980:fma32(nativeScalarLog10f(product),20,20);
    const delta=f(target-state.level);state.level=f(state.level+c.levelStep);
    if(delta>-200){
     state.head=(state.head===0?state.slots.length:state.head)-1;
     if(state.active<state.slots.length)state.active++;
     const slot=state.slots[state.head];
     const designed=designReleaseFilter({type:3,frequency:2000,q:f(.4),decibels:delta},c.sampleRate),g=designed.gain,a=designed.coefficients;
     slot.coefficients.set([f(a[1]*g),a[3],f(g*a[0]),a[2],g]);
     slot.history.fill(0);slot.cursor=0;slot.gain=f(f(f(state.peak*c.scale)*control)*square);slot.valid=true;
     births.push({sample,slot:state.head,peak:state.peak,target,delta,gain:slot.gain});
    }
   }
   state.elapsed=f(state.elapsed-c.period);state.peak=0;
  }
  if(!state.active)continue;
  const first=state.slots[state.head];
  if(first.cursor<state.source.length){
   const y=filterSample(first,state.source[first.cursor++]);output[sample]=fma32(y,first.gain,output[sample]);
  }else state.active--;
  for(let i=1;i<state.active;i++){
   const slot=state.slots[(state.head+i)%state.slots.length];
   if(slot.cursor>=state.source.length){state.active--;continue;}
   const y=filterSample(slot,state.source[slot.cursor++]);output[sample]=fma32(y,slot.gain,output[sample]);slot.gain=f(c.decay*slot.gain);
  }
 }
 return {output,births};
}
