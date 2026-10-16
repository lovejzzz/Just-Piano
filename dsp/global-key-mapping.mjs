// 83a7c0 + 73f328, with the 1d17f8 scalar curve and mode-3 boundaries.
import {compactScalarCurve} from './post-excitation.mjs';
const f=Math.fround;
export class GlobalKeyMapping {
 constructor(initialKeys,initial,producer){
  if(!initialKeys.length||initialKeys.length>128||initialKeys.some(k=>![k.raw,k.value].every(Number.isFinite)||!Number.isInteger(k.flag)||k.flag<0||k.flag>255||!Array.isArray(k.modes)||k.modes.some(i=>!Number.isInteger(i)||i<0||i>=producer.modeCount)))throw new Error('Invalid initial global key profile');
  this.keys=initialKeys.map(k=>({raw:k.raw,value:k.value,flag:k.flag}));this.modeLists=initialKeys.map(k=>k.modes.slice());
  this.globalControl=initial.globalControl;this.rawGlobalControl=initial.rawGlobalControl;this.producer=producer;
  this.keyChanges=0;this.keyDirtyMarks=0;this.globalChanges=0;this.producerCalls=0;
 }
 mapKeys(rawInputs,flags,curve){
  if(rawInputs.length!==this.keys.length||flags.length!==this.keys.length||!rawInputs.every(Number.isFinite)||flags.some(x=>!Number.isInteger(x)||x<0||x>255))throw new Error('Invalid global key input');
  for(let i=0;i<this.keys.length;i++){
   const raw=f(rawInputs[i]),flag=flags[i],key=this.keys[i];
   if(raw===key.raw&&flag===key.flag)continue;
   key.raw=raw;key.value=compactScalarCurve(curve,raw);key.flag=flag;this.keyChanges++;
   this.producer.addDirtyModes(0,this.modeLists[i]);this.keyDirtyMarks+=this.modeLists[i].length;
  }
 }
 mapGlobal(raw,curve){
  if(!Number.isFinite(raw))throw new Error('Invalid global control input');
  this.rawGlobalControl=f(raw);const value=compactScalarCurve(curve,this.rawGlobalControl),changed=value!==this.globalControl;
  if(changed){
   this.globalControl=value;this.producer.addDirtyModes(1,Array.from({length:this.producer.weightedModeCount},(_,i)=>i));this.globalChanges++;
  }
  if(changed||this.producer.bitsets.some(s=>!(s.flag&1))){
   this.producerCalls++;
   return {ran:true,...this.producer.process({modeCount:this.producer.modeCount,weightedModeCount:this.producer.weightedModeCount,timeScale:this.producer.timeScale,
    keys:this.keys,globalControl:this.globalControl,bitsets:this.producer.getBitsets()})};
  }
  return {ran:false,updates:[],bitsets:this.producer.getBitsets()};
 }
}
