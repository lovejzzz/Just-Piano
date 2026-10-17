import assert from 'node:assert/strict';
import {applySourcePhaseOffsets,sourcePhaseCoordinate} from '../dsp/source-phase-offsets.mjs';
import {prepareEndpointSourceTables} from '../dsp/endpoint-source-reference.mjs';
import {prepareModalInputs} from '../dsp/modal-source.mjs';
assert.deepEqual(sourcePhaseCoordinate(-0),{integer:0,eligible:true,odd:false});
assert.deepEqual(sourcePhaseCoordinate(-1),{integer:0,eligible:false,odd:false});
assert.deepEqual(sourcePhaseCoordinate(1.5),{integer:1,eligible:false,odd:true});
assert.deepEqual(sourcePhaseCoordinate(4294967296),{integer:4294967295,eligible:true,odd:true});
assert.equal(sourcePhaseCoordinate(4294967808).eligible,false);
const controls={globalDegrees:90,evenOffset:.2,oddDegrees:30,evenDegrees:-45,oddDelay:.001,evenDelay:-.002};
const coordinates=[0,1,1.5,4294967296];
const input={rows:4,columns:3,coordinates,controls,phaseConstant:Math.PI,
 frequency:Array.from({length:4},()=>[440,442,444]).flat(),phase:Array.from({length:4},()=>[.1,.2,.3]).flat()};
const before=JSON.stringify(input),own=applySourcePhaseOffsets(input);
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0).toString(16).padStart(8,'0');};
// Standalone ARM coordinate + independent C/fmaf golden words.
const expected=`3fef7642 40d7abe7 400487ee
3fd5dca8 bef72dfc 3fef7642
3fd5dca8 3fe2a975 3fef7642
3fd5dca8 bef72dfc 3fef7642`.split(/\s+/);
assert.deepEqual(Array.from(own.phase,bits),expected);
assert.ok(own.phase[1]>2*Math.PI); // no wrap after G corrections
assert.equal(JSON.stringify(input),before);
assert.deepEqual(own.summary,{globalValues:12,evenValues:3,secondColumnValues:3,skippedCoordinates:1});
const prepared=prepareModalInputs({frequency:440,offsets:[0,0,0],offsetExponent:0,stiffness:0,componentStiffness:[0],spread:0,frequencyRatios:[1],blend:1});
const coupled={rows:4,columns:3,frequency:input.frequency,phase:input.phase,amplitude:Array(12).fill(1),decay:Array(12).fill(1)};
const result=prepareEndpointSourceTables({prepared,coupled,phaseOffsets:{coordinates,controls,phaseConstant:Math.PI}});
assert.deepEqual(Array.from(result.phase,bits),expected);
assert.equal(result.laterPhaseControlsApplied,true);assert.equal(result.completeCacheVerified,false);
assert.deepEqual(Array.from(result.normalizedAmplitude),Array(12).fill(1));
const noOffsets=prepareEndpointSourceTables({prepared,coupled});
assert.equal(noOffsets.laterPhaseControlsApplied,false);assert.deepEqual(Array.from(noOffsets.phase,bits),input.phase.map(bits));
const one=applySourcePhaseOffsets({...input,rows:1,columns:1,coordinates:[1],frequency:[440],phase:[0]});
assert.equal(one.summary.secondColumnValues,0);
assert.throws(()=>applySourcePhaseOffsets({...input,controls:{}}));
assert.throws(()=>applySourcePhaseOffsets({...input,coordinates:[]}));
assert.throws(()=>applySourcePhaseOffsets({...input,phaseConstant:undefined}));
assert.throws(()=>sourcePhaseCoordinate(NaN));
console.log('G phase global/even/second-column order, saturating coordinate boundary, no wrap and endpoint integration passed.');
