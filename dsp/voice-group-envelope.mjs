// 428784 group envelope and the four-lane 322148 multiplicative ramp.
import {nativeScalarExp} from './native-scalar-exp.mjs';
const f=Math.fround;
const fromBits=x=>{const v=new DataView(new ArrayBuffer(4));v.setUint32(0,x);return v.getFloat32(0);};
const minimumGain=fromBits(0x2edbe6ff),minimumStep=fromBits(0x3727c5ac);
// 07aac8: ceil(float32(sampleRate * float32(0.05))).
export function initializeVoiceGroupEnvelope(sampleRate,rate){
 if(!Number.isFinite(sampleRate)||sampleRate<=0||!Number.isFinite(rate))throw new Error('Finite group-envelope model inputs required');
 const duration=Math.ceil(f(f(sampleRate)*fromBits(0x3d4ccccd)));
 if(duration<1||duration>0xffffffff)throw new Error('Group-envelope duration outside uint32 range');
 return {gain:1,step:0,active:0,elapsed:0,rate:f(rate),duration};
}
// 35f894: old velocity (H+78) and new effective velocity (H+2fd8).
export function voiceGroupActivationStrength(oldVelocity,newEffectiveVelocity){
 if(![oldVelocity,newEffectiveVelocity].every(Number.isFinite))throw new Error('Finite strike velocities required');
 const base=f(1-Math.max(0,f(f(oldVelocity)-f(newEffectiveVelocity))));
 return f(base*base);
}
// 6edcf8: reactivation preserves the gain carried by the previous ramp.
export function activateVoiceGroupEnvelope(state,strength){
 if(!Number.isFinite(strength)||!Number.isFinite(state.rate)||!Number.isInteger(state.active)||state.active<0||state.active>255||!Number.isInteger(state.duration)||state.duration<=0||state.duration>0xffffffff)throw new Error('Finite group-envelope control and positive duration required');
 if(state.active&1)return;
 state.active=1;state.elapsed=0;
 const speed=f(f(-f(f(state.rate)*Math.max(f(strength),fromBits(0x358637bd))))/f(state.duration));
 state.step=speed===0?1:nativeScalarExp(f(speed*fromBits(0x3debc8e3)));
}
export function renderVoiceMultiplicativeRamp(input,gain,step){
 if(!input.length||input.length%16||!Number.isFinite(gain)||!Number.isFinite(step)||!input.every(Number.isFinite))throw new Error('Aligned finite multiplicative ramp required');
 gain=gain<minimumGain?0:f(gain);step=f(step);step=step<minimumStep?0:step;
 const lanes=[gain];for(let i=1;i<4;i++)lanes.push(f(step*lanes[i-1]));
 const square=f(step*step),stride=f(square*square),output=new Float32Array(input.length);
 for(let i=0;i<input.length;i+=4)for(let lane=0;lane<4;lane++){output[i+lane]=f(lanes[lane]*f(input[i+lane]));lanes[lane]=f(lanes[lane]*stride);}
 return {output,gain:lanes[0]};
}
export function renderVoiceGroupEnvelope(groups,state){
 if(!groups.length||groups.length>3||groups.some(g=>!g.length||g.length%16)||!Number.isFinite(state.gain)||!Number.isFinite(state.step)||![0,1].includes(state.active)||!Number.isInteger(state.elapsed)||state.elapsed<0||state.elapsed>0xffffffff||!Number.isInteger(state.duration)||state.duration<0||state.duration>0xffffffff)throw new Error('Verified group-envelope state and aligned blocks required');
 const start=f(state.gain),active=state.active===1;state.gain=start;state.step=f(state.step);
 return groups.map(input=>{
  if(!active)return Float32Array.from(input,x=>f(f(x)*start));
  const result=renderVoiceMultiplicativeRamp(input,start,state.step);state.gain=result.gain;state.elapsed=(state.elapsed+input.length)>>>0;
  if(state.elapsed>state.duration)state.active=0;
  return result.output;
 });
}
