import assert from 'node:assert/strict';
import {prepareModalInputs} from '../dsp/modal-source.mjs';
import {constructCoupledPoles,constructCoupledSource} from '../dsp/coupled-pole-source.mjs';
import {prepareEndpointSourceTables} from '../dsp/endpoint-source-reference.mjs';
import {sortNativeSmallPoleIndices,rootsToFrequencyDecay} from '../dsp/modal-poles.mjs';
for(const n of [1,2,3])for(let code=0;code<5**n;code++){
  let k=code;const keys=Array.from({length:n},()=>{const v=[-1,-0,0,1,2][k%5];k=Math.floor(k/5);return v;});
  const expected=Array.from({length:n},(_,i)=>i).sort((a,b)=>keys[b]-keys[a]);
  assert.deepEqual(sortNativeSmallPoleIndices(keys),expected);
}
assert.deepEqual(rootsToFrequencyDecay([0,1,0,1,0,1],440,1e6).order,[0,1,2]);
assert.throws(()=>sortNativeSmallPoleIndices([1,2,3,4]),/N1\/N2\/N3/);
const prep={frequency:440,offsets:[-.3,.1,.4],offsetExponent:0,stiffness:.0001,componentStiffness:[.0001],spread:.3,frequencyRatios:[1],blend:1};
const prepared=prepareModalInputs(prep),scalar={flags:0,special:0,dimension:1};
const poleControls={coordinateScale:1,coordinates:[1,2,3,4,5],note:69,jitterAmount:.03,sampleRate:48000,frequencyCutoff:2000,
 frequencyGrid:{coordinates:[69],curves:[{x:[],y:[0]}]},runtimeCurveModes:[scalar],
 impedance:{strength:300,minimumReference:1,tilt:0,mixture:0,polarRadius:1,phaseCurve:{x:[],y:[0],...scalar},bandFrequencies:[],bandDb:[]},
 polynomialControls:{kappa:Math.PI,gamma:0,decayFloorRatio:1e6}};
const poles=constructCoupledPoles({...poleControls,prepared});assert.equal(poles.rows,4);assert.equal(poles.columns,3);
assert.equal(poles.traces.length,4);assert.equal(poles.frequency.length,12);assert.equal(poles.rawDecay.length,12);
assert.ok(poles.traces.every(t=>t.rootAlgorithm==='recovered-native-cubic-qr'&&t.inputs.s3===0));
assert.ok(poles.traces.every(t=>t.p===t.impedanceP*t.factor&&t.q===t.impedanceQ*t.factor));
assert.notEqual(poles.traces[0].factor,poles.traces[1].factor);
assert.deepEqual(constructCoupledPoles({...poleControls,prepared}),poles);
for(const n of [1,2]){
 const own=constructCoupledPoles({...poleControls,prepared:prepareModalInputs({...prep,offsets:prep.offsets.slice(0,n)})});
 assert.equal(own.columns,n);assert.equal(own.frequency.length,own.rows*n);assert.ok([...own.frequency,...own.rawDecay].every(Number.isFinite));
 if(n===1){
  const endpoint=prepareModalInputs({...prep,offsets:prep.offsets.slice(0,n)}).endpoints[0];
  const reference=endpoint.base*Math.fround(poleControls.coordinateScale);
  assert.ok(own.traces.length>1&&reference!==own.traces[0].mode);
  assert.ok(own.traces.every(t=>t.singleComponentReference===reference));
  assert.equal(own.polynomialControlsRequired,false);
  assert.deepEqual(constructCoupledPoles({...poleControls,polynomialControls:undefined,
   prepared:prepareModalInputs({...prep,offsets:prep.offsets.slice(0,n)})}),own);
 }
 if(n===2)assert.ok(own.traces.every(t=>t.rootAlgorithm==='recovered-native-quadratic-block'));
}
assert.equal(constructCoupledPoles({...poleControls,prepared,coordinates:[1,100,2]}).rows,1);
assert.equal(constructCoupledPoles({...poleControls,prepared,sampleRate:2000}).rows,2);
const source={poleControls,weights:[1,.8,.6,.4,.2],amplitudeControls:{addedDecay:10,shape:.8,eta:.5,integerScale:1},phaseAmount:.4,phaseConstant:Math.PI};
const full=prepareEndpointSourceTables({prepared,coupledSource:source});
assert.equal(full.coupledPolesComputed,true);assert.equal(full.independentPolesComputed,false);assert.equal(full.completeCacheVerified,false);
assert.equal(full.rows,4);assert.equal(full.columns,3);assert.ok([...full.frequency,...full.decay,...full.normalizedAmplitude,...full.phase].every(Number.isFinite));
const empty=prepareEndpointSourceTables({prepared,coupledSource:{...source,poleControls:{...poleControls,frequencyCutoff:1}}});
assert.equal(empty.rows,0);assert.equal(empty.referenceIndex,-1);assert.equal(empty.normalizedAmplitude.length,0);
const mixedPrepared=prepareModalInputs({...prep,blend:.5});
const independentSource={...source,poleControls:{...poleControls,componentPowerScale:[1]},frequencyRatios:[1],componentAmplitudeScale:[1,1,1]};
const mixed=prepareEndpointSourceTables({prepared:mixedPrepared,coupledSource:source,independentSource});
assert.equal(mixed.coupledPolesComputed,true);assert.equal(mixed.independentPolesComputed,true);assert.equal(mixed.columns,3);
assert.ok([...mixed.normalizedAmplitude].every(Number.isFinite));
assert.throws(()=>constructCoupledPoles({...poleControls,prepared,polynomialControls:undefined}),/polynomial/);
assert.throws(()=>constructCoupledPoles({...poleControls,prepared,coordinates:[0]}),/positive coordinates/);
assert.throws(()=>constructCoupledPoles({...poleControls,prepared,archiveContext:{}}),/cannot mix/);
assert.throws(()=>constructCoupledSource({...source,prepared,componentPoles:[]}),/cannot use supplied/);
assert.throws(()=>prepareEndpointSourceTables({prepared,coupledSource:source,coupled:full}),/Choose computed/);
assert.throws(()=>constructCoupledPoles({...poleControls,prepared:prepareModalInputs({...prep,blend:0})}),/Complete coupled/);
const old=Object.fromEntries(['pow','exp','log','log2','sin','cos','tan','hypot'].map(k=>[k,Math[k]]));
try{for(const k in old)Math[k]=()=>{throw new Error('Independent math fallback forbidden');};assert.deepEqual(prepareEndpointSourceTables({prepared,coupledSource:source}).normalizedAmplitude,full.normalizedAmplitude);}finally{Object.assign(Math,old);}
console.log('Own coupled N1/N2/N3 poles, cutoff/jitter, amplitude/phase, mixed endpoint consumption and no independent math fallback passed');
