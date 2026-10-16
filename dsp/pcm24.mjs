// CLI writer 91bae8..91bb08: binary64 FMA with INT32_MAX and rounding bias.
// The observed 24-bit OFF-dither output retains the signed32 high three bytes.
import {fma64} from './modal-poles.mjs';
const view=new DataView(new ArrayBuffer(8));
export function nativePcmSigned32(value){
 if(!Number.isFinite(value)||Math.fround(value)!==value)throw new Error('Finite float32 PCM input required');
 // The decoded clipping branches are not dynamically exercised here.
 if(Math.abs(value)>=1)throw new Error('PCM saturation range unverified');
 view.setFloat64(0,fma64(value,2147483647,6755399441055744));
 return view.getInt32(4);
}
export function encodeObservedPcm24(channels){
 if(channels.length!==2||channels[0].length!==channels[1].length)throw new Error('Stereo PCM shape required');
 const out=new Uint8Array(channels[0].length*6);
 for(let i=0;i<channels[0].length;i++)for(let channel=0;channel<2;channel++){
  const sample=nativePcmSigned32(channels[channel][i])>>8,offset=i*6+channel*3;
  out[offset]=sample&255;out[offset+1]=(sample>>8)&255;out[offset+2]=(sample>>16)&255;
 }
 return out;
}
