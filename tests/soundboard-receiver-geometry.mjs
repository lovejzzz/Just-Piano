import assert from 'node:assert/strict';
import {constructSoundboardReceiverGeometry} from '../dsp/soundboard-receiver-geometry.mjs';
const input={grid:{nx:1,ny:1,size:4,h:1,boundaryScale:Float32Array.of(0,0)},
 shape:Float32Array.of(0,0.5,0.25,0.75),primary:[Float32Array.of(0.25,0.25,0.5)],
 offsets:[Float32Array.of(0.25,0,0)],parents:Uint32Array.of(0),offsetScale:1,
 width:1,height:1,planeHeight:1,planeOffset:0,angleScale:1,angleDegrees:0,mirror:1};
const own=constructSoundboardReceiverGeometry(input);
assert.equal(own.geometry.length,6);
assert.deepEqual(own.geometry.map(g=>[g.kind,g.serial,g.channel]),[[0,0,0],[0,1,1],[1,0,0],[1,1,1],[2,0,0],[2,1,1]]);
assert.deepEqual(own.geometry[2].coordinates,Float32Array.of(0.25,0.25,1.5));
assert.deepEqual(own.geometry[4].coordinates,Float32Array.of(0.25,0.25,-0.5));
assert.equal(own.geometry[2].amplitude,0.8125);
assert.equal(own.attenuations[1].attenuation,0.6875);
assert.equal(own.geometry[3].amplitude,0.8125);
assert.equal(own.geometry[4].amplitude,1);
assert.equal(constructSoundboardReceiverGeometry({...input,mirror:0}).geometry.length,4);
assert.throws(()=>constructSoundboardReceiverGeometry({...input,parents:Uint32Array.of(1)}),/geometry inputs/);
assert.deepEqual(input.primary[0],Float32Array.of(0.25,0.25,0.5));
console.log('PASS planar reflection, bilinear attenuation, shifted receiver inheritance and mirror branches');
