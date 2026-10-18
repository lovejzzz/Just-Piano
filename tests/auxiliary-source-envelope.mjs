import assert from 'node:assert/strict';
import {AuxiliarySourceEnvelope64} from '../dsp/auxiliary-source-envelope.mjs';
const profile={delay:0,gain:[1,0],primary:'a',secondary:null,filters:[],flags:[0,0]};
const make=(samples,options={})=>new AuxiliarySourceEnvelope64([profile,profile,profile],new Map([['a',samples]]),
  {sampleRate:48000,initialScale:1,releaseAge:64,quietLimit:64,quietThreshold:Math.fround(.01),...options});
const controls={numerator:1,denominator:1,voiceFlags:255,parentSkip:0,voiceSkip:0};
const active=make(new Float32Array(256).fill(1));
assert.ok(active.process64(controls).every(row=>row.every(x=>x===1)));
assert.equal(active.envelope.enabled,0);
const released=active.process64(controls);
assert.equal(active.envelope.enabled,1);
assert.ok(released.every(row=>row[0]===1&&row[63]<row[1]&&row[1]<1));
assert.ok(active.envelope.gain<1);

// Retirement stops the envelope advance in the same block, even on note-off.
const source=new Float32Array(128);source.fill(1,0,64);
const tail=make(source);tail.process64(controls);
assert.ok(tail.process64(controls).every(row=>row.every(x=>Object.is(x,0))));
assert.equal(tail.quietCounter,64);assert.equal(tail.parentSkip,1);
assert.equal(tail.envelope.gain,1);
assert.equal(tail.envelope.ready,0);

// Native silence is strictly below the threshold; equality remains active.
const threshold=Math.fround(.01),equal=make(new Float32Array(128).fill(threshold));
equal.process64(controls);equal.process64(controls);
assert.equal(equal.quietCounter,0);assert.equal(equal.parentSkip,0);
assert.throws(()=>make(source,{releaseAge:1}));
assert.throws(()=>make(source,{quietThreshold:0}));
console.log('MIDI release, same-block quiet retirement, preserved gain and strict threshold guards passed (synthetic).');
