import assert from 'node:assert/strict';
import {prepareModalInputs} from '../dsp/modal-source.mjs';
import {endpointReferenceFrequency,prepareEndpointSourceTables} from '../dsp/endpoint-source-reference.mjs';
const args={frequency:440,offsets:[10,-6],offsetExponent:0,stiffness:3,componentStiffness:[8],spread:0,frequencyRatios:[1,2]};
for(const [blend,expected] of [[0,217],[.25,273.25],[1,442]]){
  const p=prepareModalInputs({...args,blend});assert.equal(p.blend,blend);
  assert.equal(endpointReferenceFrequency(p),expected);
  if(blend>0){assert.equal(p.endpoints[0].referenceFrequency,442);assert.equal(p.endpoints[0].base,221);}
  if(blend<1){assert.equal(p.endpoints.at(-1).referenceFrequency,217);assert.equal(p.endpoints.at(-1).base,217/3);}
}
assert.equal(endpointReferenceFrequency(prepareModalInputs({...args,frequencyRatios:[2],blend:0})),217);
const prepared=prepareModalInputs({...args,blend:1});
const coupled={rows:3,columns:2,frequency:[440,480,444,484,442,482],decay:[1,2,3,4,5,6],amplitude:[2,4,1,8,3,6],phase:[0,1,2,3,4,5]};
const result=prepareEndpointSourceTables({coupled,prepared});
assert.equal(result.referenceFrequency,442);assert.equal(result.referenceIndex,2);
assert.equal(result.normalizationMaximum,8);assert.equal(result.normalizationScale,.125);
assert.deepEqual(Array.from(result.normalizedAmplitude),[.25,.5,.125,1,.375,.75]);
assert.deepEqual(Array.from(result.amplitude),coupled.amplitude);
assert.equal(result.laterPhaseControlsApplied,false);assert.equal(result.completeCacheVerified,false);
assert.equal(prepareEndpointSourceTables({prepared,coupled:{...coupled,rows:2,frequency:[441,480,443,484],decay:[1,1,1,1],amplitude:[1,1,1,1],phase:[0,0,0,0]}}).referenceIndex,0);
const empty={rows:0,columns:2,frequency:[],decay:[],amplitude:[],phase:[]};
const skipped=prepareEndpointSourceTables({coupled:empty,prepared});
assert.equal(skipped.referenceIndex,-1);assert.equal(skipped.normalizationScale,1);assert.equal(skipped.normalizedAmplitude.length,0);
const zeros=prepareEndpointSourceTables({prepared,coupled:{...coupled,amplitude:Array(6).fill(0)}});
assert.equal(zeros.normalizationScale,Infinity);assert.ok([...zeros.normalizedAmplitude].every(Number.isNaN));
assert.throws(()=>endpointReferenceFrequency({...prepared,endpoints:[]}));
assert.throws(()=>endpointReferenceFrequency({...prepared,endpoints:[{...prepared.endpoints[0],referenceFrequency:NaN}]}));
assert.throws(()=>endpointReferenceFrequency({...prepared,blend:.1})); // not float32
const separate=prepareModalInputs({...args,blend:0});
assert.throws(()=>endpointReferenceFrequency({...separate,endpoints:[...separate.endpoints].reverse()}));
assert.throws(()=>prepareEndpointSourceTables({coupled,prepared:{...prepared,scaledOffsets:[0]}}));
console.log('Endpoint mean/last-component reference, shared maximum normalization, first tie, empty skip and boundary guards passed.');
