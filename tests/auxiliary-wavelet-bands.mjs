import assert from 'node:assert/strict';
import {auxiliaryWaveletBands,auxiliaryBandEnergy} from '../dsp/auxiliary-wavelet-bands.mjs';
const d={integerc:123,scalar28:44100,floats4:[.75,3],vector10:[0,0],
 records50:[{scalar0:.001,vector20:[1,0],vector8:[1,0],scalar38:2},
 {scalar0:.002,vector20:[1,0],vector8:[1,0],scalar38:3}],floats48:[.02,1]};
const r=auxiliaryWaveletBands(d);
assert.equal(r.fullWaveformImplemented,false);assert.equal(r.frames,882);
for(const band of r.bands){
 assert.ok(band.samples.every(Number.isFinite));
 const target=d.records50[band.band].scalar38;
 assert.ok(Math.abs(auxiliaryBandEnergy(band.samples)-target*target)<.0001);
}
const edited=structuredClone(d);edited.records50[0].vector8[1]=-.5;
const changed=auxiliaryWaveletBands(edited);
assert.notDeepEqual(changed.bands[1].samples,r.bands[1].samples);
assert.deepEqual(changed.bands[0].samples,r.bands[0].samples);
const boosted=structuredClone(d);boosted.vector10[0]=6;
assert.ok(auxiliaryWaveletBands(boosted).bands[1].gain>1.99);
assert.throws(()=>auxiliaryWaveletBands({...d,records50:d.records50.map(b=>({...b,scalar38:NaN}))}));
const zero=structuredClone(d);zero.records50[0].vector20=[0,0];
assert.throws(()=>auxiliaryWaveletBands(zero),RangeError);
console.log('Detail-band normalization, AR edit propagation, isolated bands, dB gain and degenerate-energy guards passed');
