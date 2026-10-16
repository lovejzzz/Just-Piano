// 35ed60: selected old voice -> repeated-strike enable/age/attenuation/history.
import {nativeScalarExp} from './native-scalar-exp.mjs';
const f=Math.fround;
const view=new DataView(new ArrayBuffer(4));
const word=n=>{view.setUint32(0,n);return view.getFloat32(0);};
export function repeatedStrikeControl({mode,newVelocity,hostRate,pedal,threshold,old}){
 if(!Number.isInteger(mode)||![newVelocity,hostRate,pedal,threshold].every(Number.isFinite)||hostRate<=0)throw new RangeError('Finite repeated-strike controls required');
 const result={repeatFlag:0,age:0,oldVelocity:0,attenuation:0,history:[],exp:null};
 if(!old)return result;
 if(!Number.isInteger(old.count)||old.count<0||old.count>0xffffffff||![old.duration,old.release,old.velocity,...old.history].every(Number.isFinite)||old.history.length>16)throw new RangeError('Complete bounded old-voice state required');
 const count=f(old.count),duration=f(old.duration),release=f(old.release);
 if(mode!==0||old.count===0||f(duration*f(hostRate))<=count||!(f(pedal)>f(threshold)||release<.99))return result;
 if(duration<=0)throw new RangeError('Positive active repeat duration required');
 result.repeatFlag=1;result.age=f(count/f(hostRate));result.oldVelocity=f(old.velocity);result.history=old.history.map(f);
 const sum=Math.max(f(f(newVelocity)+result.oldVelocity),word(0x38d1b717));
 const ratio=f(result.oldVelocity/sum),weight=Math.min(1,f(ratio+ratio));
 const remaining=f(f(duration-result.age)/duration),square=f(remaining*remaining);
 let decay=0;
 if(release!==1){const db=f(release*-90);decay=1;if(db!==0){const input=f(db*word(0x3debc8e3));decay=nativeScalarExp(input);result.exp={input,result:decay};}}
 // Native multiplies weight*exp first, then square*that product.
 result.attenuation=Math.max(0,Math.min(1,f(square*f(weight*decay))));
 return result;
}
