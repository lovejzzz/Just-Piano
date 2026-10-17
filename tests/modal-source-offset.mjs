import assert from 'node:assert/strict';
import {modalOffsetScale,prepareModalInputs} from '../dsp/modal-source.mjs';
const args={frequency:880,offsetExponent:1,offsets:[-.25,.5],stiffness:.001,componentStiffness:[.001,.002],spread:1,frequencyRatios:[1,1],blend:1};
const source=prepareModalInputs(args);assert.equal(source.offsetScaleComputed,true);assert.equal(source.nativeOffsetScale,2);assert.deepEqual([...source.scaledOffsets],[-.5,1]);
const squared=prepareModalInputs({...args,offsetExponent:2});assert.equal(squared.nativeOffsetScale,4);assert.deepEqual([...squared.scaledOffsets],[-1,2]);
assert.equal(modalOffsetScale(440,1.3),1);assert.equal(modalOffsetScale(880,0),1);
const diagnostic=prepareModalInputs({...args,offsetScale:3});assert.equal(diagnostic.offsetScaleComputed,false);assert.deepEqual([...diagnostic.scaledOffsets],[-.75,1.5]);
assert.throws(()=>modalOffsetScale(0,1),/positive modal/);assert.throws(()=>modalOffsetScale(440,Infinity),/finite exponent/);
console.log('PASS: default modal preparation computes offset scale and propagates exponent changes; explicit diagnostic override is marked; invalid inputs rejected');
