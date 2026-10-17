import assert from 'node:assert/strict';
import {archiveImpedanceSource} from '../dsp/archive-impedance-source.mjs';
import {prepareModalInputs} from '../dsp/modal-source.mjs';
import {constructIndependentPoles} from '../dsp/independent-pole-source.mjs';
import {prepareEndpointSourceTables} from '../dsp/endpoint-source-reference.mjs';
const constant=x=>({x:[],y:[x]});
const control={curves:[constant(1),constant(1),constant(1),{x:[100,10000],y:[10,40]}],curves248:[constant(.5),constant(2),constant(1.5)],
 scalar148:.3,vectors:[[3,5],[3,-2]],curve_list478:{coordinates:[0,127],curves:[{x:[100,10000],y:[0,3]},{x:[100,10000],y:[-2,2]}]}};
const field=(object_offset,value)=>({object_offset,value});
const baseFields=[field(0x2a38,control),field(0x1bf8,[0,127]),field(0x2548,{indexmap:Array(128).fill(2),vectors:[[1],[1],[1,10]]}),
 field(0x1d48,[2,2]),field(0x1d18,[50,100]),field(0x1d60,[.5,1])];
const presetFields=[field(0x1398,0),field(0x588,{curves:[constant(1),constant(1),constant(1)],scalars:[1,1,1]})];
const scalar={flags:0,special:0,dimension:1};
const archiveContext={baseFields,presetFields,mode:0,runtimeCurveMode:'linear-clamp',phaseCurveMode:scalar,
 frequencyCurveModes:[scalar,{...scalar,flags:1}],polarRadius:.2};
const own=archiveImpedanceSource({...archiveContext,note:69});
assert.equal(own.impedance.strength,2);assert.equal(own.componentCount,2);
assert.deepEqual(Array.from(own.componentPowerScale),[1,10]);assert.equal(own.archiveControlsComputed,true);
const secondary=archiveImpedanceSource({...archiveContext,note:69,mode:1});assert.equal(secondary.impedance.strength,1);
assert.equal(own.runtimeCurveModes[1].flags,1);assert.equal(own.polarRadiusExplicit,true);
const prepared=prepareModalInputs({frequency:440,offsets:[0,0],offsetExponent:0,stiffness:0,componentStiffness:[0],spread:0,frequencyRatios:[1],blend:0});
const poleControls={prepared,archiveContext,note:69,coordinateScale:1,coordinates:[1,2,3,4],jitterAmount:0,sampleRate:48000,frequencyCutoff:2000};
const poles=constructIndependentPoles(poleControls);assert.equal(poles.impedanceFromArchive,true);assert.equal(poles.componentPoles[0].rows,4);
const independentSource={poleControls,weights:[1,1,1,1],frequencyRatios:[1],componentAmplitudeScale:[1],
 amplitudeControls:{addedDecay:0,shape:0,eta:1,integerScale:1},phaseAmount:0,phaseConstant:Math.PI};
const full=prepareEndpointSourceTables({prepared,independentSource});
assert.equal(full.independentImpedanceFromArchive,true);assert.equal(full.independentPolesComputed,true);assert.equal(full.rows,4);
assert.ok([...full.normalizedAmplitude].every(Number.isFinite));assert.equal(full.completeCacheVerified,false);
const changed=structuredClone(archiveContext);changed.presetFields.find(r=>r.object_offset===0x588).value.scalars[0]=2;
assert.equal(archiveImpedanceSource({...changed,note:69}).impedance.strength,4);
assert.notDeepEqual(Array.from(constructIndependentPoles({...poleControls,archiveContext:changed}).componentPoles[0].rawDecay),Array.from(poles.componentPoles[0].rawDecay));
assert.throws(()=>constructIndependentPoles({...poleControls,impedance:own.impedance}));
assert.throws(()=>constructIndependentPoles({...poleControls,frequencyGrid:own.frequencyGrid}));
assert.throws(()=>archiveImpedanceSource({...archiveContext,note:69,polarRadius:undefined}));
assert.throws(()=>archiveImpedanceSource({...archiveContext,note:69,phaseCurveMode:undefined}));
assert.throws(()=>archiveImpedanceSource({...archiveContext,note:69,frequencyCurveModes:[]}));
const ageing=structuredClone(archiveContext);ageing.presetFields[0].value=1;
assert.throws(()=>archiveImpedanceSource({...ageing,note:69}));
const originals=Object.fromEntries(['pow','exp','log','log2','sin','cos','tan'].map(k=>[k,Math[k]]));
try{
 for(const k of Object.keys(originals))Math[k]=()=>{throw new Error('JS transcendental fallback forbidden');};
 assert.deepEqual(Array.from(prepareEndpointSourceTables({prepared,independentSource}).normalizedAmplitude),Array.from(full.normalizedAmplitude));
}finally{Object.assign(Math,originals);}
console.log('Archive impedance controls/grid/power, runtime-mode guards and independent endpoint consumption passed.');
