import assert from 'node:assert/strict';
import {wrapEndpointPhase,morphPairedEndpointPhases,endpointAmplitudeTypes} from '../dsp/endpoint-morph.mjs';
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
// Independent ARM scalar/SIMD oracle words. Float pi followed by double -pi
// makes wrap(0) nonzero; replacing this with a conventional modulo is wrong.
assert.equal(bits(wrapEndpointPhase(0)),0x33bbbd2e);
assert.equal(bits(wrapEndpointPhase(3)),0x40400001);
assert.equal(bits(wrapEndpointPhase(-3)),0xc0400000);
assert.equal(bits(wrapEndpointPhase(-8)),0xbfdbc091);
assert.equal(bits(wrapEndpointPhase(8)),0x3fdbc097);
assert.deepEqual(endpointAmplitudeTypes([1,0,1,0],[1,1,0,0]),[0,1,2,3]);
assert.deepEqual(morphPairedEndpointPhases([3,3,3,3],[-3,-3,-3,-3],.5,[0,1,2,3]).map(bits),
  [0x34aeef4c,0xc0400000,0x40400001,0x33bbbd2e]);
assert.deepEqual(morphPairedEndpointPhases([],[],.5,[]),[]);
assert.throws(()=>morphPairedEndpointPhases([1],[1],.5,undefined));
assert.throws(()=>morphPairedEndpointPhases([1],[1],.5,[4]));
assert.throws(()=>morphPairedEndpointPhases([1],[1],.5,[.5]));
assert.throws(()=>morphPairedEndpointPhases([1],[1],-1,[0]));
assert.throws(()=>endpointAmplitudeTypes([1],[]));
assert.throws(()=>endpointAmplitudeTypes([-1],[1]));
for(const x of [NaN,Infinity,-Infinity])assert.throws(()=>wrapEndpointPhase(x));
console.log('Endpoint phase floor/FMA/double-pi wrapping, amplitude states and linear phase morph passed.');
