import assert from 'node:assert/strict';
import {constructSoundboardArchiveSources} from '../dsp/soundboard-archive-source.mjs';

// Synthetic values exercise serialized groups whose native source offsets are
// noncontiguous. No factory data or captured native object is used here.
const curve = dimensions => ({version:32771,indices:[],x:[0,1],y:Array.from({length:2*dimensions},(_,i)=>i+0.25)});
const fixture = () => ({schema:1,baseVersion:89,soundboards:{version:1,filters:[{
  version:9,flag100:1,mode:0,mode9c:1,scalars:[1,2,3,4,5,6],
  curves:[curve(1),curve(1),curve(3)],child108:{version:5,scalar0:7,
    scalars20:Array.from({length:13},(_,i)=>10+i),scalars70:[30,31,32,33],
    scalarsd4:[40,41,42],vector8:[0.1,0.2,0.3,0.4],vector58:[2,3,4],curve78:curve(1)}
}]},presetFields:[{object_offset:0xf98,kind:'f32',value:2},
  {object_offset:0x1018,kind:'f32',value:340},{object_offset:0x1020,kind:'f32',value:0.37},
  {object_offset:0x1024,kind:'u32',value:1}]});
const own=constructSoundboardArchiveSources(fixture()),component=own.components[0];
const m=new DataView(component.model.buffer),p=new DataView(component.preset.buffer);
for(const [offset,value] of [[0x50,1],[0x64,6],[0x108,7],[0x128,10],[0x158,22],
  [0x178,30],[0x1d0,31],[0x1d4,32],[0x1d8,33],[0x1dc,40],[0x1e4,42]])assert.equal(m.getFloat32(offset,true),value);
assert.equal(m.getUint32(0x1c8,true),1);
assert.equal(p.getFloat32(0x1020,true),Math.fround(0.37));
assert.equal(p.getUint32(0x1024,true),1);
assert.equal(component.modelOffsets.length,31);
assert.deepEqual(component.modelBytes,[0x1cc,0x1cd]);
assert.equal(m.getBigUint64(0x110,true),0n); // native vector pointer is absent
assert.equal(own.nativeModelOrPresetSnapshotsUsedForConstruction,false);
assert.equal(own.fullNativeRecordsRecreated,false);
const rejects=change=>{const a=fixture();change(a);assert.throws(()=>constructSoundboardArchiveSources(a),RangeError);};
rejects(a=>a.baseVersion=90);
rejects(a=>a.presetFields.push({...a.presetFields[0]}));
rejects(a=>a.presetFields.pop());
rejects(a=>a.presetFields[0].value=1e100);
rejects(a=>a.presetFields[3].value=2);
rejects(a=>a.soundboards.filters[0].mode=1);
rejects(a=>a.soundboards.filters[0].child108.scalars70.pop());
rejects(a=>a.soundboards.filters[0].child108.curve78.version=3);
rejects(a=>a.soundboards.filters[0].curves[2].indices=[0]);
rejects(a=>a.soundboards.filters[0].curves[2].x=[1,1]);
rejects(a=>a.soundboards.filters[0].curves[2].y.pop());
rejects(a=>a.soundboards.filters[0].child108.scalar0=NaN);
console.log('soundboard archive source: synthetic mapping and rejection checks passed');
