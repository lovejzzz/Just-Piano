import assert from 'node:assert/strict';
import {renderVoiceGroupEnvelope} from '../dsp/voice-group-envelope.mjs';

// 322184/322188/32218c selects zero below 0x3727c5ac, not that threshold.
// A tiny nonzero lane would leak energy after the first sample of the ramp.
const word=new DataView(new ArrayBuffer(4));
const fromBits=x=>{word.setUint32(0,x);return word.getFloat32(0);};
const input=new Float32Array(16).fill(1);
for(const step of [0,-0,-1,fromBits(0x3727c5ab)]){
 const state={gain:1,step,active:1,elapsed:0,duration:64};
 const [output]=renderVoiceGroupEnvelope([input],state);
 assert.deepEqual([...output],[1,...Array(15).fill(0)]);
 assert.equal(state.gain,0);
}
const threshold=fromBits(0x3727c5ac);
const state={gain:1,step:threshold,active:1,elapsed:0,duration:64};
const [output]=renderVoiceGroupEnvelope([input],state);
assert.equal(output[1],threshold);
assert(output[2]>0);
assert.equal(input[15],1);
console.log('PASS: native multiplicative ramp underflow selection and exact boundary');
