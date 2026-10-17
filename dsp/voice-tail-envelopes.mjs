// 416d3c and 2523b4: post-Rattle envelopes before spatial expansion.
import {fma32} from './modal-kernel.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
import {renderVoiceMultiplicativeRamp} from './voice-group-envelope.mjs';
const f=Math.fround,word=new DataView(new ArrayBuffer(4));
const fromBits=x=>{word.setUint32(0,x);return word.getFloat32(0);};
const logScale=fromBits(0xc10af967),expScale=fromBits(0x3debc8e3);
// 07a60c initializes both terminal ramps to gain=1, sentinel step and floor.
// Later model setup supplies slope/scale; enable events remain external inputs.
export function initializeTerminalVoiceEnvelope(sampleRate,slope,scale){
 if(![sampleRate,slope,scale].every(Number.isFinite)||sampleRate<=0)throw new Error('Finite terminal model fields required');
 return {period:f(sampleRate),slope:f(slope),scale:f(scale),gain:1,step:fromBits(0x501502f9),target:fromBits(0x2edbe6ff),enabled:0,ready:0};
}
function prepare(state){
 if(!Object.values(state).every(Number.isFinite)||!Number.isInteger(state.enabled)||state.enabled<0||state.enabled>255||!Number.isInteger(state.ready)||state.ready<0||state.ready>255)throw new Error('Finite terminal envelope fields required');
 if(!(state.ready&1)&&state.enabled!==0){
  const db=fma32(f(f(state.scale)*f(state.slope)),logScale,90);
  const attenuation=db<0?-0:-db;
  const speed=f(f(1/f(f(state.period)*f(state.scale)))*attenuation);
  state.step=speed===0?1:nativeScalarExp(f(speed*expScale));
  state.target=attenuation===0?1:nativeScalarExp(f(attenuation*expScale));
  if(!Number.isFinite(state.step)||state.step>1)throw new Error('Terminal envelope error branch unsupported');
  state.ready=1;
  return true;
 }
 if(state.ready&1&&state.enabled&1)return true;
 return state.gain!==1;
}
// Every group and auxiliary row starts at the same gain. Only the auxiliary
// matrix call commits the last row's ramp gain (416e48-416e50).
export function renderTerminalVoiceEnvelope(groups,auxiliary,state){
 if(groups.length!==3||auxiliary.length!==3||[...groups,...auxiliary].some(g=>g.length!==64||!g.every(Number.isFinite)))throw new Error('Three aligned terminal voice/auxiliary rows required');
 if(!prepare(state))return {groups:groups.map(g=>Float32Array.from(g)),auxiliary:auxiliary.map(g=>Float32Array.from(g))};
 const start=state.gain;
 const output=groups.map(g=>renderVoiceMultiplicativeRamp(g,start,state.step).output);
 const aux=auxiliary.map(g=>renderVoiceMultiplicativeRamp(g,start,state.step));
 state.gain=aux.at(-1).gain;
 return {groups:output,auxiliary:aux.map(g=>g.output)};
}

// Native uses double state and double sample products, then FCVTN to float32.
export function renderVoiceTimeEnvelope(groups,auxiliary,state){
 if(groups.length!==3||auxiliary.length!==3||[...groups,...auxiliary].some(g=>g.length!==64||!g.every(Number.isFinite)))throw new Error('Aligned time-envelope matrices required');
 for(const k of ['enabled','delay','attack','decay','counter'])if(!Number.isInteger(state[k])||state[k]<0||state[k]>0xffffffff)throw new Error('Uint32 time-envelope controls required');
 for(const k of ['attackRate','decayRate','value'])if(!Number.isFinite(state[k]))throw new Error('Finite double time-envelope state required');
 const result={groups:groups.map(g=>Float32Array.from(g)),auxiliary:auxiliary.map(g=>Float32Array.from(g))};
 if(state.enabled!==1)return result;
 const endA=(state.delay+state.attack)>>>0,endB=(endA+state.decay)>>>0;
 for(let i=0;i<64;i++){
  const age=state.counter;
  if(age===state.delay||age===endA)state.value=1;
  let gain=0;
  if(age>=state.delay){
   if(age>=endB)gain=state.decay===0?1:0;
   else if(age<endA){state.value*=state.attackRate;gain=(1-state.value)*1.5873015873015872;}
   else{state.value*=state.decayRate;gain=(state.value-0.37)*1.5873015873015872;}
  }
  if(gain!==1)for(const row of [...result.groups,...result.auxiliary])row[i]=f(row[i]*gain);
  state.counter=(age+1)>>>0;
 }
 return result;
}
