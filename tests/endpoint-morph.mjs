import assert from 'node:assert/strict';
import {endpointSineWeights,morphPairedEndpointValue,morphEndpointAmplitudes} from '../dsp/endpoint-morph.mjs';
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
// Independent system sin/logf/expf/pow/fmaf oracle words, not target snapshots.
assert.deepEqual(Object.values(endpointSineWeights(.25)).map(bits),[0x3e15f61a,0x3f5a827a]);
assert.equal(bits(morphPairedEndpointValue(1,.25,.25)),0x3eb83c4a);
assert.equal(bits(morphEndpointAmplitudes([1],[.25],.25)[0]),0x3eb504f3);
assert.equal(bits(morphEndpointAmplitudes([0],[1],.5)[0]),0x3dac3730);
assert.equal(bits(morphEndpointAmplitudes([1],[0],.5)[0]),0x3dac3730);
// The native tiny floor survives even at the otherwise silent endpoint.
assert.equal(bits(morphEndpointAmplitudes([0],[1],1)[0]),0x1e3ce508);
assert.equal(bits(morphEndpointAmplitudes([1],[0],0)[0]),0x1e3ce508);
assert.deepEqual(morphEndpointAmplitudes([0],[0],.5),[0]);
assert.deepEqual(morphEndpointAmplitudes([],[],.5),[]);
assert.equal(bits(morphEndpointAmplitudes([0],[1],.5,0)[0]),0x3f5744fd);
for(const blend of [-1,2,NaN,Infinity])assert.throws(()=>endpointSineWeights(blend));
assert.throws(()=>morphEndpointAmplitudes([1],[],.5));
assert.throws(()=>morphEndpointAmplitudes([-1],[1],.5));
assert.throws(()=>morphEndpointAmplitudes([Infinity],[1],.5));
assert.throws(()=>morphPairedEndpointValue(Infinity,1,.5));
const originals=Object.fromEntries(['sin','pow','log','exp'].map(k=>[k,Math[k]]));
try{
  for(const key of Object.keys(originals))Math[key]=()=>{throw new Error('JS math fallback forbidden');};
  assert.equal(bits(morphPairedEndpointValue(1,.25,.25)),0x3eb83c4a);
  assert.equal(bits(morphEndpointAmplitudes([0,1],[1,.25],.25)[1]),0x3eb504f3);
}finally{Object.assign(Math,originals);}
console.log('Endpoint scalar sine weights, log amplitudes, zero fades, tiny floor and input guards passed.');
