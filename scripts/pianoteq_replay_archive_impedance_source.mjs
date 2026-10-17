// Bind the composed archive source to complete historical native impedance
// captures. Four input arguments and runtime curve modes remain observed.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {archiveImpedanceSource} from '../dsp/archive-impedance-source.mjs';
import {modalImpedance} from '../dsp/modal-impedance.mjs';
import {nativeImpedanceMath} from '../dsp/native-impedance-math.mjs';
const [basePath,presetPath,beforePath,after2Path,after3Path,radiusPath,gridPath,output]=process.argv.slice(2);
if(!output)throw new Error('Base, preset, before, two return captures, radius, grid and NEW report required');
const paths={basePath,presetPath,beforePath,after2Path,after3Path,radiusPath,gridPath},data={},sources={};
for(const [key,file] of Object.entries(paths)){
 const bytes=fs.readFileSync(file);data[key]=JSON.parse(bytes);sources[key]={sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
const base=data.basePath[0],preset=data.presetPath,before=data.beforePath,grids=data.gridPath;
for(const c of [before,data.after2Path,data.after3Path,data.radiusPath,grids])if(c.errors?.length||!c.records?.length)throw new Error('Complete historical captures required');
if(before.records.length!==36||grids.records.length!==36)throw new Error('Complete 36-call scope required');
const radii=new Set(data.radiusPath.records.map(x=>x.radius));if(radii.size!==1)throw new Error('Unique observed radius required');
const polarRadius=[...radii][0],view=new DataView(new ArrayBuffer(8)),failures=[];
const fbits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const dbits=x=>{view.setFloat64(0,x);return view.getBigUint64(0).toString(16);};
const key=r=>`${r.note_index}:${r.cache_mode}:${r.modal_coordinate}`,returns=new Map();
if(new Set(before.records.map(key)).size!==36||before.records.some(r=>r.note_index!==69)||
 before.records.filter(r=>r.cache_mode===0).length!==26||before.records.filter(r=>r.cache_mode===1).length!==10)
 throw new Error('Expected exact A4 26/10 unique native impedance calls');
for(const capture of [data.after2Path,data.after3Path])for(const r of capture.records){
 if(returns.has(key(r))&&['p','q'].some(k=>dbits(returns.get(key(r))[k])!==dbits(r[k])))throw new Error('Conflicting native return snapshots');
 returns.set(key(r),r);
}
if(returns.size!==36||before.records.some(r=>!returns.has(key(r))))throw new Error('Incomplete native return coverage');
let controlValues=0,curveValues=0,pqValues=0;const configurations=new Map();
function array(a,b,stage){
 if(a.length!==b.length){failures.push({stage,reason:'length'});return;}
 for(let i=0;i<a.length;i++){curveValues++;if(fbits(a[i])!==fbits(b[i]))failures.push({stage,index:i,reason:'float-bits'});}
}
for(const r of before.records){
 const configKey=`${r.note_index}:${r.cache_mode}`,config=grids.configurations[configKey];
 if(!config)throw new Error('Missing exact runtime frequency grid configuration');
 const own=archiveImpedanceSource({baseFields:base.fields,presetFields:preset.decoded_tail.fields,note:config.note,mode:r.cache_mode,
  runtimeCurveMode:'linear-clamp',polarRadius,
  phaseCurveMode:{flags:r.phase_curve.log_x,special:r.phase_curve.special_mode,dimension:r.phase_curve.dimension},
  frequencyCurveModes:config.frequency_curves.map(c=>({flags:c.log_x,special:c.special_mode,dimension:c.dimension}))});
 const input=own.impedance;
 for(const [name,offset] of [['strength','0x20'],['minimumReference','0x38'],['tilt','0x50'],['mixture','0xc8']]){
  controlValues++;if(fbits(input[name])!==fbits(r.controls[offset]))failures.push({stage:'archive-control',key:key(r),name});
 }
 array(input.phaseCurve.x,r.phase_curve.x,'phase-x');array(input.phaseCurve.y,r.phase_curve.y,'phase-y');
 array(input.bandFrequencies,r.band_frequencies,'band-frequencies');array(input.bandDb,r.band_gains,'band-db');
 if(!configurations.has(configKey)){
  array(own.frequencyGrid.coordinates,config.pitch_coordinates,'pitch-grid');
  for(let i=0;i<own.frequencyGrid.curves.length;i++)for(const k of ['x','y'])array(own.frequencyGrid.curves[i][k],config.frequency_curves[i][k],'frequency-curve-'+k);
  configurations.set(configKey,own);
 }
 const args=r.inputs,target=returns.get(key(r));
 const predicted=modalImpedance({...input,fundamental:args.s0,reference:args.s1,frequency:args.s2,extraDb:args.s3},nativeImpedanceMath);
 for(const name of ['p','q']){pqValues++;if(dbits(predicted[name])!==dbits(target[name]))failures.push({stage:'native-pq',key:key(r),name});}
}
const report={passed:failures.length===0,failures,configurations:configurations.size,calls:before.records.length,controlValues,curveValues,pqValues,sources,
 scope:'Cross-historical archive-control/grid binding and original coupled p/q; four arguments, modes and polar radius observed',
 sameRunPresetIdentityVerified:false,nativeIndependentTrajectoryVerified:false,newAudioRendered:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,sources:undefined}));if(!report.passed)process.exitCode=1;
