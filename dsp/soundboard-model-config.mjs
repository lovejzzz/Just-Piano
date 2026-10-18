// Selected SoundboardIRCompute configuration fields produced by 0x1001ba68c.
// Native pointers, vectors and unimplemented policy fields are never synthesized.
const f=Math.fround;
import {constructSoundboardRatePolicy} from './soundboard-rate-policy.mjs';
const f32Copies=[[0x24,0x154],[0x28,0x158],[0x30,0x54],[0x3c,0x60],[0x60,0x108],
 [0x84,0x12c],[0x8c,0x130],[0x90,0x134],[0x94,0x138],[0x98,0x13c],[0x9c,0x140],
 [0xa0,0x144],[0xa4,0x148],[0xa8,0x14c],[0xac,0x1d0],[0xe0,0x1d8],[0xe8,0x178],
 [0x140,0x1dc],[0x144,0x1e0],[0x148,0x1e4],[0x14c,0x150]];

export function constructSoundboardModelConfig({model,preset,bridge,propagationModes,component,
 linearPosition=false,twoPosition=false,rootLidEnabled=null,mode=0,runtimeRates=null,familyPolicy=null}){
 if(!(model instanceof Uint8Array)||model.byteLength<0x1e8||!(preset instanceof Uint8Array)||preset.byteLength<0x1840||
  !(bridge instanceof Float32Array)||bridge.length!==4||bridge.some(v=>!Number.isFinite(v))||
  !(propagationModes instanceof Float32Array)||propagationModes.length!==3||propagationModes.some(v=>!Number.isFinite(v))||
  !Number.isInteger(component)||component<0||component>0xffffffff||mode!==0||
  typeof linearPosition!=='boolean'||typeof twoPosition!=='boolean')throw new RangeError('Supported model/preset source configuration required');
 const m=new DataView(model.buffer,model.byteOffset,model.byteLength),p=new DataView(preset.buffer,preset.byteOffset,preset.byteLength);
 const family=m.getUint32(0x98,true);
 if(![0,1].includes(family)||(family===1&&familyPolicy?.modelFamily!==1)||
  (familyPolicy&&familyPolicy.modelFamily!==family))throw new RangeError('Explicit supported model geometry family policy required');
 const output=new Uint8Array(0x220),v=new DataView(output.buffer),computedOffsets=[];
 const setWord=(offset,word)=>{v.setUint32(offset,word,true);computedOffsets.push(offset);};
 const setFloat=(offset,value)=>{value=f(value);if(!Number.isFinite(value))throw new RangeError('Non-finite configuration scalar');
  v.setFloat32(offset,value,true);computedOffsets.push(offset);};
 setWord(0,component);
 const ratePolicy=runtimeRates?constructSoundboardRatePolicy(runtimeRates):null;
 if(ratePolicy)setFloat(0x2c,ratePolicy.outputRate);
 for(const [offset,source]of f32Copies)setFloat(offset,m.getFloat32(source,true));
 const height=m.getFloat32(0x50,true),stringLength=p.getFloat32(0xf98,true);
 setFloat(0x38,height<0?Math.abs(f(height*stringLength)):height);
 if(!(v.getFloat32(0x38,true)>0&&v.getFloat32(0x38,true)<100))throw new RangeError('Native soundboard height bounds exceeded');
 const planeShift=familyPolicy?.uprightRoot?Math.max(new Float32Array(new Uint32Array([0x3a83126f]).buffer)[0],familyPolicy.verticalOffset):0;
 setFloat(0x34,f(m.getFloat32(0x58,true)+planeShift));
 let lidEnabled=p.getUint32(0x1024,true)!==0;
 if(!lidEnabled){if(typeof rootLidEnabled!=='boolean')throw new RangeError('Explicit root lid enable flag required');lidEnabled=rootLidEnabled;}
 setFloat(0x40,lidEnabled?p.getFloat32(0x1020,true):1);
 let position=m.getFloat32(0x128,true);
 if(linearPosition)position=f(f(f(component)/f(-88))+1);
 else if(twoPosition&&component===1)position=f(0.5);
 else if(twoPosition&&component===2)position=f(0.6);
 setFloat(0x80,position);
 setFloat(0x88,p.getFloat32(0x1018,true));
 setWord(0xe4,Math.trunc(propagationModes[0]));
 setWord(0x138,m.getUint32(0x1c8,true));
 output[0x13c]=model[0x1cc];output[0x13d]=model[0x1cd];
 // Mode-zero construction always chooses this inspected float32 separation.
 setWord(0x1c8,0x3c0b4396);
 output[0x1cc]=1;
 output[0x1cf]=Number(family===1);
 output[0x1d0]=Number(m.getUint32(0x9c,true)!==0);
 return {config:output,initializationConfig:output.slice(0,0x130),bridge:bridge.slice(),
  computedOffsets:computedOffsets.sort((a,b)=>a-b),computedBytes:[0x13c,0x13d,0x1cc,0x1cf,0x1d0],
  outputRateComputed:Boolean(ratePolicy),ratePolicy,fullConfigurationComputed:false,sourceModelAndPresetStillObserved:true};
}
