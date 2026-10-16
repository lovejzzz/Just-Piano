import fs from 'node:fs';
import {renderEmptyGlobalFilter} from '../dsp/settled-global-processing.mjs';
const [capturePath,reportPath,option,sourcePath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||option!=='--global-report'||!sourcePath||extra.length)throw new Error('Usage: capture.json report.json --global-report computed-global.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8')),source=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
if(!data.windowComplete||data.errors.length||data.records.length!==data.ordinalLimit*8||!source.passed||source.mismatches||source.blocks!==data.ordinalLimit)throw new Error('Complete verified global windows required');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);},from=x=>{view.setUint32(0,x);return view.getFloat32(0);};
let count=0,mismatches=0;const failures=[],predictions=[],states=[];
function check(name,p,a){if(p.length!==a.length)throw new Error('Incomplete filter vector');for(let i=0;i<p.length;i++){count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite filter value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
function metadata(state,actual){
 if(actual.sections||actual.table.length||actual.history.length||actual.coefficients.length||actual.fast!==state.fast||actual.updating!==state.updating)throw new Error('Unverified filter state');
 check('gain',[state.gain],[actual.gain]);check('level',state.level,actual.gainWords.slice(0,4).map(from));
}
for(let n=0;n<data.ordinalLimit;n++){
 const records=data.records.slice(n*8,n*8+8),global=records[0],post=records[7];
 if(global.stage!=='global'||post.stage!=='postFilter'||records.some(r=>r.ordinal!==n)||global.maskEnabled||global.otherMixEnabled!==1)throw new Error('Global branch/chronology differs');
 const computed=source.predictions[n];if(computed.ordinal!==n)throw new Error('Global source order differs');
 for(let row=0;row<3;row++)check(`${n}:global:${row}`,computed.output[row],global.output.values[row]);
 const output=[];
 for(let row=0;row<3;row++){
  const before=records[1+row*2],after=records[2+row*2];
  if(before.stage!=='before'||after.stage!=='after'||before.bank!=='global'||after.bank!=='global'||before.row!==row||after.row!==row)throw new Error('Global filter chronology differs');
  if(!n)states[row]={...before.filter,level:before.filter.gainWords.slice(0,4).map(from)};
  metadata(states[row],before.filter);output.push(renderEmptyGlobalFilter(before.input,states[row]));metadata(states[row],after.filter);
  check(`${n}:${row}:filtered`,output[row],after.output);check(`${n}:${row}:channelBankBypass`,output[row],post.output.values[row]);
 }
 predictions.push({ordinal:n,output:output.map(row=>[...row])});
}
const report={passed:!mismatches,count,matched:count-mismatches,mismatches,windowComplete:true,blocks:data.ordinalLimit,
 globalBoundaryComputed:true,cabinetMixInputStillObserved:true,emptyFilterInitializationComputed:true,channelBankEffectAbsentInWindow:true,
 completeVoiceOrBrowserEquivalence:false,predictions,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,predictions:undefined,failures:undefined}));if(!report.passed)process.exitCode=1;
