// 428784 group envelope and the four-lane 322148 multiplicative ramp.
const f=Math.fround;
const fromBits=x=>{const v=new DataView(new ArrayBuffer(4));v.setUint32(0,x);return v.getFloat32(0);};
const minimumGain=fromBits(0x2edbe6ff),minimumStep=fromBits(0x3727c5ac);
function ramp(input,gain,step){
 gain=gain<minimumGain?0:f(gain);step=Math.max(minimumStep,f(step));
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
  const result=ramp(input,start,state.step);state.gain=result.gain;state.elapsed=(state.elapsed+input.length)>>>0;
  if(state.elapsed>state.duration)state.active=0;
  return result.output;
 });
}
