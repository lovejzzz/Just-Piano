import assert from 'node:assert/strict';
import {constructSoundboardProcessingConfig as construct} from '../dsp/soundboard-processing-config.mjs';
const fixture=()=>({archive:{modelFeatures:{leadingSilencePresetOverride:0},soundboards:{filters:[{mode:0}]}},
 microphones:{primary:[Float32Array.of(0,0,0),Float32Array.of(1,0,0)],mixes:Float32Array.of(.3,.8)},
 geometry:[{channel:0,kind:0,identity:0,serial:0},{channel:1,kind:0,identity:1,serial:0},
  {channel:2,kind:0,identity:0,serial:1},{channel:3,kind:0,identity:1,serial:1},
  {channel:0,kind:1,identity:0,serial:0}]});
const own=construct(fixture());
assert.deepEqual(own.channels,[{identity:'0',kind:0,flag:0},{identity:'1',kind:0,flag:0},
 {identity:'0',kind:0,flag:1},{identity:'1',kind:0,flag:1}]);
assert.equal(own.blend.mainCount,2);assert.equal(own.blend.kernelLength,0);
assert.equal(own.blend.leadingSilenceMode,1);assert.deepEqual(Array.from(own.blend.coefficients),[Math.fround(.3),Math.fround(.8)]);
assert.equal(own.nativeProcessingConfigurationUsedForConstruction,false);
const reject=change=>{const a=fixture();change(a);assert.throws(()=>construct(a),RangeError);};
reject(a=>a.mode=1);
reject(a=>a.archive.modelFeatures.leadingSilencePresetOverride=1);
reject(a=>a.archive.soundboards.filters[0].mode=2);
reject(a=>a.microphones.mixes[0]=NaN);
reject(a=>a.geometry.splice(2,1));
console.log('processing configuration: paired channel metadata, blend policy and rejection checks passed');
