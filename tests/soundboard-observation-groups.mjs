import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {sortSoundboardObservationRecords} from '../dsp/soundboard-observation-sort.mjs';
import {constructSoundboardObservationGroups} from '../dsp/soundboard-observation-groups.mjs';
// Independent Apple SDK libc++ std::sort oracle, lexicographic delay/index.
// Duplicate keys carry unique IDs, so the digest checks unstable tie order.
const records=Array.from({length:257},(_,id)=>({stateIndex:id*17%11,frequencyIndex:id*7%5,id}));
const sorted=sortSoundboardObservationRecords(records);
const hash=crypto.createHash('sha256').update(Buffer.from(Uint32Array.from(sorted.records,r=>r.id).buffer)).digest('hex');
assert.equal(hash,'4f695325d838f9ef87b96b90b590886d00282f0d47e178904c5ebcc3d575d539');
assert.ok(sorted.branches.ninther>0);
assert.equal(records[0].id,0);
const heap=sortSoundboardObservationRecords(records,{depthLimit:0});
assert.equal(heap.branches.heap,1);
const key=r=>r.stateIndex*5+r.frequencyIndex;
assert.ok(heap.records.every((r,i,a)=>!i||key(a[i-1])<=key(r)));
assert.equal(new Set(heap.records.map(r=>r.id)).size,257);
assert.deepEqual(sortSoundboardObservationRecords([]).records,[]);
assert.throws(()=>sortSoundboardObservationRecords([{stateIndex:-1,frequencyIndex:0}]),/uint32/);
const grid={nx:1,ny:1,size:4,h:1,tau:0.01};
const result=constructSoundboardObservationGroups({grid,geometry:[
 {coordinates:Float32Array.of(0,0,1),channel:0,kind:0,amplitude:1},
 {coordinates:Float32Array.of(0,0,-1),channel:0,kind:1,amplitude:1},
],gains:Float32Array.of(1,0.5,0.25),planeHeight:0,speed:100,steps:65,flags:1,phaseMode:true});
assert.equal(result.observations.length,1);
assert.equal(result.observations[0].groups.reduce((sum,g)=>sum+g.entries.length,0),8);
assert.equal(result.observations[0].length,131);
assert.equal(result.observations[0].groups[0].offset,1);
assert.ok(result.observations[0].groups[0].entries.some(e=>e.b<0));
console.log('PASS independent libc++ tie-order digest, heap bounds/permutation and observation packing');
