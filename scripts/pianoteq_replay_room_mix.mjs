import fs from 'node:fs';
import {mixInactiveRoom} from '../dsp/settled-global-processing.mjs';
const [capturePath,reportPath,option,sourcePath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||option!=='--source-report'||!sourcePath||extra.length)throw new Error('Usage: capture.json report.json --source-report computed-filter-output.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8')),source=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
if(!data.windowComplete||data.errors.length||data.records.length!==data.ordinalLimit*4||!source.passed||source.mismatches||source.blocks!==data.ordinalLimit)throw new Error('Complete verified room windows required');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
let count=0,mismatches=0;const failures=[],predictions=[];
function check(name,p,a){if(p.length!==a.length)throw new Error('Incomplete room vector');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite room value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
const seed=data.records[2];
for(let n=0;n<data.ordinalLimit;n++){
 const records=data.records.slice(n*4,n*4+4),[pre,post,mix,returned]=records,up=source.predictions[n];
 if(up.ordinal!==n||records.some((r,i)=>r.ordinal!==n||r.stage!==['preEffects','postEffects','roomMix','returned'][i]))throw new Error('Room chronology differs');
 if(mix.hasConvolution||mix.hasExternal||mix.spatialEnabled||mix.rampActive||mix.wet.rows!==3||mix.wet.samples!==64)throw new Error('Active room path not covered');
 check('dry gains',seed.dryGains,mix.dryGains);check('wet gains',seed.wetGains,mix.wetGains);
 for(let r=0;r<3;r++){
  if(mix.dryRamps[r][3]||mix.wetRamps[r][3])throw new Error('Active room ramp not covered');
  check('dry state',seed.dryRamps[r],mix.dryRamps[r]);check('wet state',seed.wetRamps[r],mix.wetRamps[r]);
  check(`${n}:${r}:pre`,up.output[r],pre.output.values[r]);check(`${n}:${r}:effectsBypass`,up.output[r],post.output.values[r]);
  check(`${n}:${r}:roomInput`,up.output[r],mix.output.values[r]);check(`${n}:${r}:clearedWet`,new Float32Array(64),mix.wet.values[r]);
 }
 const output=mixInactiveRoom(up.output,seed.dryGains,seed.wetGains);
 for(let r=0;r<3;r++)check(`${n}:${r}:returned`,output[r],returned.output.values[r]);
 predictions.push({ordinal:n,output:output.map(row=>[...row])});
}
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,blocks:data.ordinalLimit,
 computedRoomInputs:true,wetScratchClearedIndependently:true,roomGainInitializationStillObserved:true,earlierCabinetMixStillObserved:true,
 effectsAndAntiClickHaveNoEffectInWindow:true,completeVoiceOrBrowserEquivalence:false,predictions,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,predictions:undefined,failures:undefined}));if(!report.passed)process.exitCode=1;
