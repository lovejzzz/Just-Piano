import {linearModelCurve} from './model-curves.mjs';

// FUN_1003ca83c, direct (family-zero) soundboard branch. Its vector evaluator
// uses boundary mode 3: clamp endpoints and interpolate linearly in float32.
export function constructSoundboardLidGains({curve,preset,modelFamily,rootLidEnabled=null}){
  if(!(preset instanceof Uint8Array)||preset.byteLength<0x1028||modelFamily!==0||
    !curve||curve.dimensions!==3||curve.mode!==0||curve.logX!==0||
    !(curve.x instanceof Float32Array)||!(curve.y instanceof Float32Array)||
    curve.y.length!==Math.max(1,curve.x.length)*3)throw new RangeError('Supported direct-model lid gain sources required');
  const p=new DataView(preset.buffer,preset.byteOffset,preset.byteLength);
  let lidEnabled=p.getUint32(0x1024,true)!==0;
  if(!lidEnabled){if(typeof rootLidEnabled!=='boolean')throw new RangeError('Explicit root lid enable flag required');lidEnabled=rootLidEnabled;}
  const position=lidEnabled?p.getFloat32(0x1020,true):1;
  const interpolated=Float32Array.from(linearModelCurve({x:Array.from(curve.x),y:Array.from(curve.y)},position,{runtimeMode:'linear-clamp'}));
  const output=interpolated.slice();if(!lidEnabled)output[1]=0;
  return {position,lidEnabled,interpolated,output,sourceCurveStillObserved:true};
}
