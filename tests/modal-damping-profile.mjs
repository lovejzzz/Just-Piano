import assert from 'node:assert/strict';
import {archiveModalDampingProfile,modalDampingShape} from '../dsp/modal-damping-profile.mjs';
import {sumModalEnergy} from '../dsp/modal-energy-pruning.mjs';
const curve=y=>({version:32771,x:[60,72],y,indices:[]});
const baseFields=[{object_offset:0x2f10,value:{fields:[
 {object_offset:0x460,value:curve([0.003,0.002])},
 {object_offset:0x4b0,value:curve([1.5,1.2])},
 {object_offset:0x500,value:curve([500,500])},
 {object_offset:0x550,value:curve([1000,1000])}]}}];
const p=archiveModalDampingProfile({baseFields,note:69});
assert.equal(p.releaseShape,Math.fround(1.2750000953674316));
assert.equal(p.releaseLow,500);assert.equal(p.releaseHigh,1000);
const own=modalDampingShape(p,{velocity:0.5,energy:0,releaseFlag:1});
assert.equal(own.releaseShape,p.releaseShape);
assert.equal(modalDampingShape(p,{velocity:0.5,energy:own.threshold,releaseFlag:1}).releaseShape,1);
assert.equal(modalDampingShape(p,{velocity:0.5,energy:0,releaseFlag:0}).releaseShape,1);
assert.equal(modalDampingShape(p,{velocity:0.5,energy:0,releaseFlag:3}).releaseShape,1);
assert.equal(modalDampingShape(p,{velocity:1,energy:0,releaseFlag:1}).threshold,Math.fround(own.threshold/4));
const capped=structuredClone(baseFields);capped[0].value.fields[2].value.y=[1200,1200];
assert.equal(archiveModalDampingProfile({baseFields:capped,note:69}).releaseLow,990);
assert.throws(()=>archiveModalDampingProfile({baseFields:[],note:69}));
assert.throws(()=>modalDampingShape(p,{velocity:1,energy:-1,releaseFlag:1}));
// Four SIMD accumulators then (lane0+lane2)+(lane1+lane3), not scalar order.
const states=new Map([0,1,2,3,4,5,6,7].map(i=>[i,{energy:[1e8,1,1,1,1,2,2,2][i]}]));
assert.equal(sumModalEnergy(states,[[0,4,4,4],[4,8,4,1]]),Math.fround(100000008));
assert.equal(sumModalEnergy(new Map([[0,{energy:1}],[1,{energy:2}],[2,{energy:3}],[3,{energy:4}]]),[[0,4,4,1]]),10);
assert.equal(sumModalEnergy(states,[[0,4,4,0]]),0);
assert.throws(()=>sumModalEnergy(new Map(),[[0,4,4,1]]));
console.log('Damping curve interpolation, strict energy threshold, exact release flag, low/high clamp and padded SIMD energy sum passed');
