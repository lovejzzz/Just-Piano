import assert from 'node:assert/strict';
import {assembleIndependentSource,independentSourceWeights,constructIndependentComponents} from '../dsp/independent-source-assembly.mjs';
import {morphEndpointSources} from '../dsp/endpoint-source-morph.mjs';
import {prepareModalInputs} from '../dsp/modal-source.mjs';
import {prepareEndpointSourceTables} from '../dsp/endpoint-source-reference.mjs';
const f=Math.fround,weights=[1,2,3,4,5];
assert.deepEqual(Array.from(independentSourceWeights(weights,[.5,.5])),[2,4,5,5,5]);
assert.deepEqual(weights,[1,2,3,4,5]);
assert.deepEqual(Array.from(independentSourceWeights(weights,[1,1])),weights);
assert.deepEqual(Array.from(independentSourceWeights([], [.5,.5])),[]);
const components=[
 {rows:2,columns:1,frequency:[100,200],decay:[1,2],amplitude:[1,2],phase:[.1,.2]},
 {rows:4,columns:1,frequency:[110,220,0,-0],decay:[1.5,2.5,99,99],amplitude:[3,4,5,6],phase:[.3,.4,.5,.6]},
 {rows:0,columns:1,frequency:[],decay:[],amplitude:[],phase:[]}];
const input={components,componentAmplitudeScale:[2,-.5],rowLimit:4},before=JSON.stringify(input);
const own=assembleIndependentSource(input),view=new DataView(new ArrayBuffer(4));view.setUint32(0,0x1e3ce508);const tiny=view.getFloat32(0);
assert.equal(own.rows,4);assert.equal(own.columns,3);assert.deepEqual(own.componentScales,[2,-.5,-.5]);
assert.deepEqual(Array.from(own.frequency),[100,110,0,200,220,0,300,330,0,400,440,0]);
assert.deepEqual(Array.from(own.decay),[1,1.5,0,2,2.5,1,3,3.5,2,4,4.5,3]);
assert.deepEqual(Array.from(own.amplitude),[2,-1.5,tiny,4,-2,tiny,tiny,tiny,tiny,tiny,tiny,tiny]);
assert.deepEqual(Array.from(own.phase),[.1,.3,0,.2,.4,0,0,.5,0,0,.6,0].map(f));
assert.equal(JSON.stringify(input),before);
const prepared=prepareModalInputs({frequency:440,offsets:[0,0,0],offsetExponent:0,stiffness:0,componentStiffness:[0],spread:0,frequencyRatios:[1],blend:0});
const full=prepareEndpointSourceTables({prepared,independentSource:input});
assert.equal(full.independentComponentsAssembled,true);assert.equal(full.referenceIndex,3);assert.equal(full.normalizationMaximum,4);
assert.equal(full.normalizedAmplitude[1],-.375);assert.equal(full.completeCacheVerified,false);
assert.deepEqual(Array.from(full.phase),Array.from(own.phase));
// Native endpoint copy allows signed amplitudes; intermediate log morph does not.
assert.deepEqual(Array.from(morphEndpointSources({separate:own,blend:0}).amplitude),Array.from(own.amplitude));
assert.throws(()=>morphEndpointSources({coupled:own,separate:own,blend:.5}));
assert.throws(()=>prepareEndpointSourceTables({prepared,separate:own,independentSource:input}));
assert.throws(()=>assembleIndependentSource({...input,rowLimit:1}));
assert.throws(()=>assembleIndependentSource({...input,componentAmplitudeScale:[]}));
assert.throws(()=>assembleIndependentSource({...input,components:[{...components[1],frequency:[110,0,220,0]}]}));
assert.throws(()=>assembleIndependentSource({...input,components:[{...components[0],columns:2}]}));
assert.throws(()=>independentSourceWeights(weights,[]));
const poleSource={componentPoles:[
 {rows:5,columns:1,frequency:[100,200,300,400,500],rawDecay:[.5,2,8,32,128]},
 {rows:3,columns:1,frequency:[110,220,330],rawDecay:[.5,2,8]}],
 weights,frequencyRatios:[.5,.5],componentAmplitudeScale:[2],rowLimit:5,
 amplitudeControls:{addedDecay:0,shape:.8,eta:.2,integerScale:1},phaseAmount:0,phaseConstant:Math.PI};
const constructed=constructIndependentComponents(poleSource);
assert.deepEqual(Array.from(constructed.selectedWeights),[2,4,5,5,5]);
// N=1 normalization is weight*sqrt(2*decay), exact for these powers of four.
assert.deepEqual(Array.from(constructed.components[0].amplitude),[2,8,20,40,80]);
assert.deepEqual(Array.from(constructed.components[1].amplitude),[2,8,20]);
const preparedPoles=prepareModalInputs({frequency:440,offsets:[0,0],offsetExponent:0,stiffness:0,componentStiffness:[0],spread:0,frequencyRatios:[.5,.5],blend:0});
const fromPoles=prepareEndpointSourceTables({prepared:preparedPoles,independentSource:poleSource});
assert.equal(fromPoles.independentComponentsConstructed,true);
assert.equal(fromPoles.independentComponentsAssembled,true);
assert.equal(fromPoles.normalizationMaximum,160);
assert.equal(fromPoles.amplitude[8],160);assert.equal(fromPoles.amplitude[9],tiny);
const randomPhase=constructIndependentComponents({...poleSource,phaseAmount:.25});
assert.deepEqual(Array.from(randomPhase.components[0].phase.slice(0,3)),Array.from(randomPhase.components[1].phase));
assert.throws(()=>constructIndependentComponents({...poleSource,weights:[]}));
assert.throws(()=>prepareEndpointSourceTables({prepared:preparedPoles,independentSource:{...poleSource,components}}));
console.log('Independent row assembly, scale repetition, FMA padding, preserved phases, half-ratio weights and endpoint integration passed.');
