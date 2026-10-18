import assert from 'node:assert/strict';
import {archiveModalDampingControls} from '../dsp/archive-modal-damping.mjs';
const curve=y=>({version:32771,x:[],y:[y]});
const nested=[{object_offset:0x1e0,value:curve(.75)},{object_offset:0x230,value:curve(4000)},
 {object_offset:0x280,value:curve(6)},{object_offset:0x2d0,value:curve(7)},{object_offset:0x320,value:curve(.2)}];
const source={baseFields:[{object_offset:0x2f10,value:{fields:nested}},{object_offset:0x3bd8,value:curve(.1)}],presetFields:[{object_offset:0x1110,value:.2},{object_offset:0x1118,value:curve(1.5)}],note:69,positionRuntime:'initialized-primary-no-overrides'};
const own=archiveModalDampingControls(source);
assert.equal(own.position,Math.fround(Math.fround(.2)*Math.fround(1.5)));assert.equal(own.rolloff,4000);
assert.deepEqual(own.release,{gainScale:6,cubicGainScale:7,cubicScale:Math.fround(.2)});
const position=x=>archiveModalDampingControls({...source,presetFields:[{object_offset:0x1110,value:x},source.presetFields[1]]});
assert.equal(position(.0001).extraCurve.y[0],.1);
assert.throws(()=>archiveModalDampingControls({...source,baseFields:source.baseFields.slice(0,1),presetFields:[{object_offset:0x1110,value:.0001},source.presetFields[1]]}),/Archive position extra curve/);
assert.equal(position(1).position,.5);assert.equal(position(.0001).position,Math.fround(.001));
assert.throws(()=>position(0),/unverified native loading semantics/);assert.throws(()=>position(-1),RangeError);
const gain=archiveModalDampingControls({...source,baseFields:[{object_offset:0x2f10,value:{fields:nested.map(x=>x.object_offset===0x280?{...x,value:curve(8)}:x)}}]});
assert.equal(gain.position,own.position);assert.equal(gain.rolloff,own.rolloff);assert.equal(gain.release.gainScale,8);
for(const patch of [{note:NaN},{positionRuntime:'event-override'},{presetFields:[]},
 {baseFields:[{object_offset:0x2f10,value:{fields:nested.map(x=>x.object_offset===0x230?{...x,value:curve(0)}:x)}}]},
 {baseFields:[{object_offset:0x2f10,value:{fields:nested.map(x=>x.object_offset===0x280?{...x,value:{...x.value,version:1}}:x)}}]}])
 assert.throws(()=>archiveModalDampingControls({...source,...patch}));
assert.equal(source.presetFields[0].value,.2);assert.equal(nested[2].value.y[0],6);
console.log('archive modal damping: passed');
