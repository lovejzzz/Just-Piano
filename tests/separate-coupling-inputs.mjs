import assert from 'node:assert/strict';
import {couplingArguments,separateComponentExtraDb} from '../dsp/coupling-inputs.mjs';
const endpoint={kind:'separate',component:2,reference:440,base:440,stiffness:0,offsets:[0],spread:[0]};
const input={fundamental:440,endpoint,coordinateScale:0.25,mode:2,note:69,
  frequencyGrid:{coordinates:[60],curves:[{x:[],y:[0.5]}]},
  runtimeCurveModes:[{flags:0,special:0,dimension:1}],componentPowerScale:[0.1]};
const own=couplingArguments(input);
assert.deepEqual(own.inputs,{s0:440,s1:110,s2:880,s3:-9.5});
assert.equal(own.componentPower.sourceIndex,0); // shortened vector repeats its final power
assert.equal(own.baseExtraDb,-10); // power uses 10 log10, not amplitude's 20 log10
assert.equal(separateComponentExtraDb([0.1,1,10],8).extraDb,10);
assert.equal(separateComponentExtraDb([100],0).extraDb,20);
const coupled=couplingArguments({...input,endpoint:{...endpoint,kind:'coupled'},componentPowerScale:undefined});
assert.deepEqual(coupled.inputs,{s0:440,s1:110,s2:880,s3:0.5});
assert.equal(coupled.baseExtraDb,0);
assert.equal(coupled.componentPower,undefined);
assert.throws(()=>couplingArguments({...input,componentPowerScale:undefined}));
assert.throws(()=>couplingArguments({...input,endpoint:{...endpoint,offsets:[0,1]}}));
for(const value of [0,-1,NaN,Infinity])assert.throws(()=>separateComponentExtraDb([value],0));
assert.throws(()=>separateComponentExtraDb([],0));
assert.throws(()=>separateComponentExtraDb([1],-1));
const originalLog10=Math.log10;
try{
  Math.log10=()=>{throw new Error('JS log10 fallback forbidden');};
  assert.deepEqual(couplingArguments(input).inputs,own.inputs);
}finally{Math.log10=originalLog10;}
console.log('Separate power-to-dB input, final-value repetition, coupled fallback and invalid branch guards passed.');
