import assert from 'node:assert/strict';
import {constructModalOnsetInitialization} from '../dsp/modal-onset-initialization.mjs';
import {ModalOnsetEnvelope} from '../dsp/modal-onset-envelope.mjs';

// Observed baseline, audited separately against the native constructor snapshot.
const baseline=constructModalOnsetInitialization({duration:81,square:false,sampleRate:48000});
assert.deepEqual(baseline.step,[0.01939133177182437,0.9998119704485015]);
assert.deepEqual(baseline.coefficients,[0.21132487058639526,0.21132487058639526,-0.5773502588272095]);
assert.equal(baseline.settle,6);
assert.equal(baseline.nativeInitializationUsedForPrediction,false);

// Rate affects smoothing; duration affects rotation independently.
const higherRate=constructModalOnsetInitialization({duration:81,square:false,sampleRate:96000});
assert.deepEqual(higherRate.step,baseline.step);
assert.notDeepEqual(higherRate.coefficients,baseline.coefficients);
const longer=constructModalOnsetInitialization({duration:162,square:false,sampleRate:48000});
assert.notDeepEqual(longer.step,baseline.step);
assert.deepEqual(longer.coefficients,baseline.coefficients);
const lowRate=constructModalOnsetInitialization({duration:81,square:false,sampleRate:8000});
const lowerRate=constructModalOnsetInitialization({duration:81,square:false,sampleRate:4000});
assert.equal(lowRate.normalizedCutoff,Math.fround(2/3));
assert.deepEqual(lowRate.coefficients,lowerRate.coefficients);
const square=constructModalOnsetInitialization({duration:81,square:true,sampleRate:48000});
assert.equal(square.filterCoefficientsUsed,false);
assert.equal(square.settle,0);
assert.deepEqual(square.step,baseline.step);

// Caller block partition cannot reset oscillator/filter history or settle count.
for(const parameters of [baseline,higherRate,longer,square]){
 const a=new ModalOnsetEnvelope(parameters),b=new ModalOnsetEnvelope(parameters);
 const whole=a.process(256);
 const split=Float32Array.from([1,63,5,64,123].flatMap(n=>Array.from(b.process(n))));
 assert.deepEqual(split,whole);
 assert.equal(a.remaining,0);assert.equal(b.remaining,0);
 assert.equal(whole[255],1);
 assert.deepEqual(a.history,b.history);
}
for(const change of [{duration:0},{duration:1.5},{duration:0xfffffff1},{square:1},{sampleRate:0},{sampleRate:Infinity},{sampleRate:1e100}])
 assert.throws(()=>constructModalOnsetInitialization({duration:81,square:false,sampleRate:48000,...change}),RangeError);
console.log('modal onset initialization: passed');
