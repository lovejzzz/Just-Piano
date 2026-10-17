import fs from 'node:fs';
import crypto from 'node:crypto';
import {archiveWeightControls} from '../dsp/source-weight-controls.mjs';
import {sourceWeights} from '../dsp/source-weights.mjs';
import {nativeDoubleLog as log} from '../dsp/native-double-log.mjs';
import {nativeDoubleExp as exp} from '../dsp/native-double-exp.mjs';
const [basePath,presetPath,beforePath,afterPath,constantsPath,output]=process.argv.slice(2);
if(!output)throw new Error('Base, preset, before/after/constants captures and NEW report required');
const paths={basePath,presetPath,beforePath,afterPath,constantsPath},d={},sources={};
for(const [k,path] of Object.entries(paths)){const b=fs.readFileSync(path);d[k]=JSON.parse(b);sources[k]=crypto.createHash('sha256').update(b).digest('hex');}
for(const k of ['beforePath','afterPath','constantsPath'])if(d[k].errors?.length||!d[k].records?.length)throw new Error('Complete capture required');
if(d.beforePath.records.length!==1||d.afterPath.records.length!==2||d.beforePath.point!=='0x1004cb68c')throw new Error('Expected original A4 weight/source captures');
const runtimeCurveModes=Object.fromEntries(['B17d8','A8a8','B1828','B1878'].map(k=>[k,{flags:0,special:0,dimension:1}]));
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const row=d.beforePath.records[0],baseFields=d.basePath[0].fields,presetFields=d.presetPath.decoded_tail.fields;
const own=archiveWeightControls({baseFields,presetFields,note:row.note,runtimeCurveModes});
const failures=[],checks=[];
const compare=(name,a,b)=>{if(a.length!==b.length)throw new Error('Shape mismatch');let mismatches=0;for(let i=0;i<a.length;i++)if(bits(a[i])!==bits(b[i])){mismatches++;failures.push({name,index:i,predicted:a[i],actual:b[i]});}checks.push({name,values:a.length,mismatches});};
compare('four-weight-controls',Object.values(own.controls),['s0','s1','s2','s3'].map(k=>row.controls[k]));
const b=new Map(baseFields.map(r=>[r.object_offset,r.value]));
compare('base-weights-identity',b.get(0x1c28)[row.note_index-1],row.weights);
compare('coordinates-identity',b.get(0x1c40)[row.note_index-1],row.coordinates);
const offset=d.constantsPath.records[0].weight_offset;
if(!d.constantsPath.records.every(r=>r.weight_offset===offset))throw new Error('Registry offset conflict');
const predicted=sourceWeights({...row,controls:own.controls,weights:b.get(0x1c28)[row.note_index-1],coordinates:b.get(0x1c40)[row.note_index-1],weightOffset:offset},{log,exp});
for(const after of d.afterPath.records){if(after.note!==row.note||after.note_index!==row.note_index)throw new Error('Unaligned note');compare('final-weights-mode-'+after.mode,predicted.output,after.G_vectors['0x6f0']);}
const report={passed:!failures.length,checks,failures,sources,computedControls:own.controls,
 runtimeCurveModesExplicit:true,runtimeCurveModesNewlyObserved:false,remainingObservedInputs:['edit/base runtime curves','harmonic edits','G controls','weight registry offset'],
 uniqueWeights:predicted.output.length,newAudioRendered:false,completeVoiceVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
