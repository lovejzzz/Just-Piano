import assert from 'node:assert/strict';
import {auxiliaryWaveletNoise} from '../dsp/auxiliary-wavelet-noise.mjs';
const d={integerc:2986,scalar28:44100,floats4:[0,3],vector10:[0,0],records50:[{scalar0:0},{scalar0:0}],floats48:[2,1]};
const r=auxiliaryWaveletNoise(d);assert.equal(r.frames,88200);
assert.deepEqual(r.bands.map(b=>[b.band,b.reconstructedLength,b.excitation.length]),[[1,44100,22050],[0,88200,44100]]);
assert.equal(r.bands[0].excitation[0],3);
// Each detail level resets its seeded stream, rather than sharing a moving RNG.
assert.deepEqual(r.bands[0].excitation,r.bands[1].excitation.slice(0,22050));
const edited=structuredClone(d);edited.integerc++;const other=auxiliaryWaveletNoise(edited);
assert.notEqual(r.bands[0].excitation[1],other.bands[0].excitation[1]);assert.equal(other.bands[0].excitation[0],3);
const decaying=structuredClone(d);decaying.floats4[0]=1;decaying.records50.forEach(b=>b.scalar0=1);
const tail=auxiliaryWaveletNoise(decaying);assert.equal(tail.bands[0].afterFilterDecay,1);
assert.ok(tail.bands[0].excitation.slice(100).every(v=>v===0));
assert.throws(()=>auxiliaryWaveletNoise({...d,scalar28:Infinity}));
assert.throws(()=>auxiliaryWaveletNoise({...d,records50:[]}));
console.log('Wavelet dimensions, per-band RNG resets, seed sensitivity, impulse override, envelope underflow and unsupported descriptor guards passed');
