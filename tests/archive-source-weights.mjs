import assert from 'node:assert/strict';
import {archiveWeightSpectrumInputs,constructArchiveSourceWeights} from '../dsp/archive-source-weights.mjs';
const field=(object_offset,value)=>({object_offset,value}),constant=value=>({x:[],y:[value]});
const baseFields=[field(0x158,0),field(0x17d8,constant(1)),field(0x1828,constant(10000)),field(0x1878,constant(2000)),field(0x18c8,0),
 field(0x18d0,constant(0)),field(0x1c28,[[1,2]]),field(0x1c40,[[1,2]]),field(0x1c88,[1]),field(0x1ca0,[0])];
const presetFields=[field(0x8a0,1),field(0x8a8,constant(1)),field(0x1024,0),field(0x1020,1),field(0xd80,1),field(0xd30,{x:[-2,0,75],y:[0,0,0]})];
const runtimeCurveModes=Object.fromEntries(['B17d8','A8a8','B1828','B1878','Ad30','B18d0'].map(k=>[k,{flags:0,special:0,dimension:1}]));
const args={baseFields,presetFields,note:1,noteIndex:1,frequency:100,stiffness:0,runtimeCurveModes,harmonicEdits:[0],weightOffset:0};
const input=archiveWeightSpectrumInputs(args);
assert.deepEqual(input.edit_curve.x,[-2,0,4.317488193511963]);assert.deepEqual(input.G_controls,{'0x28':0,'0x78':100,'0xd8':1,'0xf0':0});
let result=constructArchiveSourceWeights(args);assert.deepEqual(result.output,[1,2]);assert.equal(result.completeWeightInputsComputed,false);
presetFields.at(-1).value.y=[6,6,6];result=constructArchiveSourceWeights(args);assert.ok(result.output[0]>1.99&&result.output[0]<2);assert.ok(result.output[1]>3.98);
presetFields.find(r=>r.object_offset===0xd80).value=0;assert.deepEqual(constructArchiveSourceWeights(args).output,[1,2]);
args.harmonicEdits=[-6,0];assert.ok(constructArchiveSourceWeights(args).output[0]<.51);
const originals=Object.fromEntries(['log','exp'].map(k=>[k,Math[k]]));
try{for(const k in originals)Math[k]=()=>{throw new Error('JS fallback forbidden');};assert.ok(constructArchiveSourceWeights(args).output.every(Number.isFinite));}finally{Object.assign(Math,originals);}
assert.throws(()=>archiveWeightSpectrumInputs({...args,noteIndex:0}),/note index/);
assert.throws(()=>archiveWeightSpectrumInputs({...args,runtimeCurveModes:{...runtimeCurveModes,Ad30:{flags:1,special:0,dimension:1}}}),/spectrum/);
baseFields[0].value=3;baseFields.push(field(0x15c,1));assert.throws(()=>archiveWeightSpectrumInputs(args),/Alternate/);
console.log('Archive spectrum logf conversion, G per-note scalars, final weights, edit dependencies and branch guards passed');
