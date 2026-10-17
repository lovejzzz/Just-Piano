import assert from 'node:assert/strict';
import {prepareModalInputs} from '../dsp/modal-source.mjs';
import {constructIndependentPoles} from '../dsp/independent-pole-source.mjs';
import {prepareEndpointSourceTables} from '../dsp/endpoint-source-reference.mjs';
const prep={frequency:440,offsets:[0,0],offsetExponent:0,stiffness:0,componentStiffness:[0],spread:0,frequencyRatios:[1],blend:0};
const prepared=prepareModalInputs(prep);
const poleControls={coordinateScale:1,coordinates:[1,2,3,4,5],note:69,jitterAmount:0,sampleRate:48000,frequencyCutoff:2000,
 frequencyGrid:{coordinates:[69],curves:[{x:[],y:[0]}]},runtimeCurveModes:[{flags:0,special:0,dimension:1}],componentPowerScale:[1],
 impedance:{strength:1,minimumReference:1,tilt:0,mixture:0,polarRadius:1,phaseCurve:{x:[],y:[0],flags:0,special:0,dimension:1},bandFrequencies:[],bandDb:[]}};
const poles=constructIndependentPoles({...poleControls,prepared});
assert.equal(poles.threshold,1980);
for(const table of poles.componentPoles){assert.deepEqual(Array.from(table.frequency),[440,880,1320,1760]);assert.deepEqual(Array.from(table.rawDecay),[2,4,6,8]);}
const power=constructIndependentPoles({...poleControls,prepared,componentPowerScale:[1,10]});
assert.equal(power.componentPoles[0].rawDecay[0],2);assert.equal(power.componentPoles[1].rawDecay[0],Math.fround(.2));
const jitter=constructIndependentPoles({...poleControls,prepared,jitterAmount:.05});
for(let row=0;row<4;row++)assert.equal(jitter.traces[row].factor,jitter.traces[row+4].factor);
assert.notEqual(jitter.traces[0].factor,jitter.traces[1].factor);
const stopped=constructIndependentPoles({...poleControls,prepared,coordinates:[1,10,2]});
assert.equal(stopped.componentPoles[0].rows,1); // stop, don't filter all later coordinates
assert.equal(constructIndependentPoles({...poleControls,prepared,sampleRate:2000}).componentPoles[0].rows,2);
const boundary=prepareModalInputs({...prep,frequency:99});
assert.equal(constructIndependentPoles({...poleControls,prepared:boundary,frequencyCutoff:100}).componentPoles[0].rows,0);
const beforeBoundary=prepareModalInputs({...prep,frequency:98.99999237060547});
assert.equal(constructIndependentPoles({...poleControls,prepared:beforeBoundary,frequencyCutoff:100}).componentPoles[0].rows,1);
const independentSource={poleControls,weights:[1,1,1,1,1],frequencyRatios:[1],componentAmplitudeScale:[1,.5],
 amplitudeControls:{addedDecay:0,shape:0,eta:1,integerScale:1},phaseAmount:0,phaseConstant:Math.PI};
const full=prepareEndpointSourceTables({prepared,independentSource});
assert.equal(full.independentPolesComputed,true);assert.equal(full.independentComponentsConstructed,true);assert.equal(full.independentComponentsAssembled,true);
assert.equal(full.rows,4);assert.equal(full.columns,2);assert.equal(full.referenceIndex,0);
assert.deepEqual(Array.from(full.frequency),[440,440,880,880,1320,1320,1760,1760]);
assert.equal(full.normalizationMaximum,4);assert.equal(full.normalizedAmplitude[0],.5);assert.equal(full.normalizedAmplitude[1],.25);
assert.equal(full.completeCacheVerified,false);
assert.throws(()=>constructIndependentPoles({...poleControls,prepared:prepareModalInputs({...prep,blend:1})}));
assert.throws(()=>constructIndependentPoles({...poleControls,prepared,coordinates:[0]}));
assert.throws(()=>constructIndependentPoles({...poleControls,prepared,componentPowerScale:[]}));
assert.throws(()=>prepareEndpointSourceTables({prepared,independentSource:{...independentSource,rowLimit:100}}));
assert.throws(()=>prepareEndpointSourceTables({prepared,independentSource:{...independentSource,componentPoles:poles.componentPoles}}));
const originals=Object.fromEntries(['pow','exp','log','log2','sin','cos','tan'].map(k=>[k,Math[k]]));
try{
 for(const k of Object.keys(originals))Math[k]=()=>{throw new Error('JS transcendental fallback forbidden');};
 assert.deepEqual(Array.from(prepareEndpointSourceTables({prepared,independentSource}).normalizedAmplitude),Array.from(full.normalizedAmplitude));
}finally{Object.assign(Math,originals);}
console.log('Own independent impedance/jitter/N1 poles, cutoff order, power input and full component/endpoint table path passed.');
