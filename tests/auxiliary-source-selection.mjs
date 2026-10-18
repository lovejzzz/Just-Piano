import assert from 'node:assert/strict';
import {selectAuxiliarySource} from '../dsp/auxiliary-source-selection.mjs';
const bank=new Map();
for(const key of [60,64,69])for(let variant=0;variant<3;variant++){
 const identity=`key${key}:variant${variant}`;bank.set(identity,{key,variant,identity,samples:new Float32Array(16)});
}
const select=(note,detune=0,variant=0)=>selectAuxiliarySource(bank,{note,detune,variant});
assert.deepEqual(select(62,0,4),{pitch:62,primary:'key60:variant1',secondary:'key64:variant1',primaryWeight:.5,secondaryWeight:.5});
assert.deepEqual(select(64),{pitch:64,primary:'key60:variant0',secondary:'key64:variant0',primaryWeight:0,secondaryWeight:1});
assert.equal(select(60).secondary,null);assert.equal(select(69).secondary,null);
assert.deepEqual(select(58),select(62));assert.deepEqual(select(71),select(67));
assert.deepEqual(select(62+36),select(62));
const longer=new Map([...bank].map(([k,v])=>[k,{...v,samples:new Float32Array(v.key===64?32:16)}]));
const swapped=selectAuxiliarySource(longer,{note:61,detune:0,variant:0});
assert.equal(swapped.primary,'key64:variant0');assert.equal(swapped.primaryWeight,.25);assert.equal(swapped.secondaryWeight,.75);
assert.throws(()=>select(62,NaN),RangeError);assert.throws(()=>select(62,0,-1),RangeError);
const tinyBank=new Map([0,127].map(key=>[String(key),{key,variant:0,identity:String(key),samples:new Float32Array(16)}]));
assert.equal(selectAuxiliarySource(tinyBank,{note:0,detune:2**-149,variant:0}).secondary,null);
console.log('Adjacent keys, exact interior keys, reflection, variant modulo and longer-primary swap pass');
