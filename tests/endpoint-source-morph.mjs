import assert from 'node:assert/strict';
import {sortEndpointFrequencyIndices} from '../dsp/endpoint-frequency-sort.mjs';
import {morphEndpointSources} from '../dsp/endpoint-source-morph.mjs';
const fields=['frequency','decay','amplitude','phase'];
const frequencies=Array.from({length:25},(_,i)=>i%3);
const oracleOrder=[0,24,6,9,12,15,3,18,21,1,4,7,10,13,16,19,22,2,5,11,14,17,20,23,8];
assert.deepEqual(sortEndpointFrequencyIndices(frequencies).indices,oracleOrder);
assert.notDeepEqual(oracleOrder,frequencies.map((_,i)=>i).sort((a,b)=>frequencies[a]-frequencies[b]));
const heap=sortEndpointFrequencyIndices(Array(100).fill(1),{depthLimit:0});
assert.equal(heap.branches.heap,1);
assert.deepEqual([...heap.indices].sort((a,b)=>a-b),Array.from({length:100},(_,i)=>i));
assert.deepEqual(sortEndpointFrequencyIndices([]).indices,[]);
assert.throws(()=>sortEndpointFrequencyIndices([NaN]));
assert.throws(()=>sortEndpointFrequencyIndices({length:-1}));
assert.throws(()=>sortEndpointFrequencyIndices([1],{depthLimit:-1}));
const coupled={rows:4,columns:2,
 frequency:[900,600,300,900,600,300,123,456],decay:[9,6,3,9,6,3,1,1],
 amplitude:[1,0,0,2,3,0,4,4],phase:[3,-3,-8,8,1,-1,0,0]};
const separate={rows:3,columns:2,
 frequency:[100,800,1000,100,400,700],decay:[1,8,10,1,4,7],
 amplitude:[2,3,1,0,0,0],phase:[-3,3,8,-8,-1,1]};
const frozen=JSON.stringify({coupled,separate});
const own=morphEndpointSources({coupled,separate,blend:.25});
assert.equal(own.rows,3);assert.equal(own.columns,2);
assert.deepEqual(own.permutations,[[0,2,1],[1,2,0]]);
const expected=`43592844 43592844 43d6a509 44205af7 44605f31 4440ad7c
400afb0d 400afb0d 40895f62 40cd413d 410f9915 40f6a09f
3fd744fd 3d372dbe 3d89624e 00000000 3e96ac46 3f62026a
bfbfffff 3fdbc097 3f800003 33bbbd2e 3fdbc097 40400001`.split(/\s+/);
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0).toString(16).padStart(8,'0');};
assert.deepEqual(fields.flatMap(k=>Array.from(own[k],bits)),expected);
assert.equal(JSON.stringify({coupled,separate}),frozen);
for(const [blend,selected] of [[0,separate],[1,coupled]]){
 const result=morphEndpointSources({[blend===0?'separate':'coupled']:selected,blend});
 assert.equal(result.rows,selected.rows);assert.equal(result.algorithm,'endpoint-copy');
 for(const key of fields)assert.deepEqual(Array.from(result[key]),selected[key]);
}
assert.throws(()=>morphEndpointSources({coupled,separate,blend:NaN}));
assert.throws(()=>morphEndpointSources({coupled,separate:{...separate,columns:1},blend:.5}));
assert.throws(()=>morphEndpointSources({coupled:{...coupled,amplitude:[]},separate,blend:.5}));
const originalSort=Array.prototype.sort;
try{
 Array.prototype.sort=()=>{throw new Error('Generic sort forbidden');};
 assert.deepEqual(sortEndpointFrequencyIndices(frequencies).indices,oracleOrder);
 assert.deepEqual(morphEndpointSources({coupled,separate,blend:.25}).permutations,own.permutations);
}finally{Array.prototype.sort=originalSort;}
console.log('Endpoint index tie ordering, heap fallback, min-row four-table assembly, copy branches and input guards passed.');
