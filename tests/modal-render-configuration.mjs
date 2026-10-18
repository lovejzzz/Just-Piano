import assert from 'node:assert/strict';
import {modalRenderConfiguration} from '../dsp/modal-render-configuration.mjs';
const c=modalRenderConfiguration({sampleRate:48000,blockSize:64});
const view=new DataView(new ArrayBuffer(4));view.setFloat32(0,c.timestep);assert.equal(view.getUint32(0),0x37aec33e);
assert.equal(c.samples,64);assert.equal(c.blockLength,64);assert.equal(c.blockFactor,1);assert.equal(c.initialPhase,0);
assert.ok(Object.isFrozen(c));assert.throws(()=>{c.blockFactor=4;});
const larger=modalRenderConfiguration({sampleRate:44100,blockSize:128});assert.equal(larger.samples,128);assert.notEqual(larger.timestep,c.timestep);
// Caller controls and target-like properties cannot override the initialization pair.
assert.equal(modalRenderConfiguration({sampleRate:48000,blockSize:64,blockFactor:99,timestep:NaN}).blockFactor,1);
for(const input of [undefined,{}, {sampleRate:1000,blockSize:64},{sampleRate:NaN,blockSize:64},
 {sampleRate:Infinity,blockSize:64},{sampleRate:48000,blockSize:0},{sampleRate:48000,blockSize:65},
 {sampleRate:48000,blockSize:516},{sampleRate:48000,blockSize:64.5}])assert.throws(()=>modalRenderConfiguration(input));
console.log('Explicit modal configuration, native reciprocal word, immutable factor/phase and invalid clock guards passed');
