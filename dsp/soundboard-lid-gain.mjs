import {linearModelCurve} from './model-curves.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';

// FUN_1003ca83c, ordinary soundboard branches. Its vector evaluator
// uses boundary mode 3: clamp endpoints and interpolate linearly in float32.
export function constructSoundboardLidGains({curve,preset,modelFamily,rootLidEnabled=null,familyPolicy=null}){
  if(!(preset instanceof Uint8Array)||preset.byteLength<0x1028||![0,1].includes(modelFamily)||
    (modelFamily===1&&familyPolicy?.modelFamily!==1)||
    (familyPolicy&&familyPolicy.modelFamily!==modelFamily)||
    !curve||curve.dimensions!==3||curve.mode!==0||curve.logX!==0||
    !(curve.x instanceof Float32Array)||!(curve.y instanceof Float32Array)||
    curve.y.length!==Math.max(1,curve.x.length)*3)throw new RangeError('Supported direct-model lid gain sources required');
  const p=new DataView(preset.buffer,preset.byteOffset,preset.byteLength);
  let lidEnabled=p.getUint32(0x1024,true)!==0;
  if(!lidEnabled){if(typeof rootLidEnabled!=='boolean')throw new RangeError('Explicit root lid enable flag required');lidEnabled=rootLidEnabled;}
  const position=lidEnabled?p.getFloat32(0x1020,true):1;
  const interpolated=Float32Array.from(linearModelCurve({x:Array.from(curve.x),y:Array.from(curve.y)},position,{runtimeMode:'linear-clamp'}));
  const output=interpolated.slice();
  if(familyPolicy?.uprightRoot&&familyPolicy.levelDb!==0){
    const gain=nativeScalarExp(Math.fround(familyPolicy.levelDb*Math.fround(Math.LN10/20)));
    output[2]=Math.fround(gain*output[2]);
  }
  if(!lidEnabled)output[1]=0;
  return {position,lidEnabled,interpolated,output,sourceCurveStillObserved:true};
}
