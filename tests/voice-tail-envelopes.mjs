import assert from 'node:assert/strict';
import {initializeTerminalVoiceEnvelope,renderTerminalVoiceEnvelope,renderVoiceTimeEnvelope} from '../dsp/voice-tail-envelopes.mjs';
const matrices=()=>Array.from({length:3},()=>new Float32Array(64).fill(1));
// Synthetic instruction-semantics checks; authentic audio is audited separately.
const initialized=initializeTerminalVoiceEnvelope(48000,1,.5);
assert.deepEqual(initialized,{period:48000,slope:1,scale:.5,gain:1,step:Math.fround(1e10),target:Math.fround(1e-10),enabled:0,ready:0});
const env={period:48000,slope:0,scale:.5,gain:1,step:.5,target:0,enabled:1,ready:1};
const a=renderTerminalVoiceEnvelope(matrices(),matrices(),env);
assert.equal(env.gain,2**-64);
for(const row of [...a.groups,...a.auxiliary]){
 assert.equal(row[0],1);assert.equal(row[1],.5);assert.equal(row[63],2**-63);
}
// Resumption consumes the carried gain once per block, regardless of row count.
const b=renderTerminalVoiceEnvelope(matrices(),matrices(),env);
// Carried 2^-64 is below the native minimum gain: next call clears it.
assert.equal(b.groups[2][0],0);assert.equal(env.gain,0);
const fresh={period:48000,slope:0,scale:.5,gain:1,step:1e10,target:Math.fround(1e-10),enabled:1,ready:0};
renderTerminalVoiceEnvelope(matrices(),matrices(),fresh);
assert.equal(fresh.ready,1);assert(fresh.step>0&&fresh.step<1);assert(fresh.target>0&&fresh.target<1);
const time={enabled:1,delay:1,attack:1,decay:1,counter:0,attackRate:.5,decayRate:.5,value:0};
const t=renderVoiceTimeEnvelope(matrices(),matrices(),time);
for(const row of [...t.groups,...t.auxiliary]){
 assert.equal(row[0],0);
 assert.equal(row[1],Math.fround(.5*1.5873015873015872));
 assert.equal(row[2],Math.fround((.5-.37)*1.5873015873015872));
 assert.equal(row[3],0);
}
assert.equal(time.counter,64);assert.equal(time.value,.5);
const bypass={...time,enabled:0,counter:0};
assert.deepEqual(renderVoiceTimeEnvelope(matrices(),matrices(),bypass).groups,matrices());
assert.equal(bypass.counter,0);
console.log('PASS: terminal row commit, carried gain, coefficient initialization and time phase boundaries');
