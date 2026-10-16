// Calculated consumer groups -> merge/unmerge -> packed spatial network -> auxiliary split.
import fs from 'node:fs';
import {combineThenRestoreGroups,spatializeVoiceGroups,distributeAuxiliary} from '../dsp/voice-spatial-output.mjs';
const [capturePath,reportPath,option,sourcePath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||option!=='--source-report'||!sourcePath||extra.length) throw new Error('Usage: capture.json report.json --source-report calculated-release-consumer.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
const source=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
if(data.schema!==1||!data.windowComplete||data.errors.length||!source.passed||source.mismatches||!source.observedConsumerWindowChainVerified) throw new Error('Complete capture and computed consumer groups required');
const bytes=new DataView(new ArrayBuffer(256));
const word=new DataView(new ArrayBuffer(4));
const from=x=>{word.setUint32(0,x);return word.getFloat32(0);};
const bits=x=>{word.setFloat32(0,x);return word.getUint32(0);};
const checks=[],failures=[],predictions=[];
function check(name,prediction,actual){
  if(prediction.length!==actual.length)throw new Error(`Incomplete ${name}`);
  let bad=0;
  for(let i=0;i<prediction.length;i++){
    if(!Number.isFinite(prediction[i])||!Number.isFinite(actual[i]))throw new Error(`Nonfinite ${name}`);
    if(bits(prediction[i])!==bits(actual[i])){bad++;if(failures.length<40)failures.push({name,index:i,predicted:prediction[i],actual:actual[i]});}
  }
  checks.push({name,count:prediction.length,mismatches:bad});
}
const stages=['before','nonlinear','filtered','expanded'];
if(data.records.length!==data.ordinalLimit*4||new Set(data.records.map(r=>r.H)).size!==1)throw new Error('Incomplete/ambiguous tail capture');
const first=data.records[0];
first.processorWords.forEach((w,i)=>bytes.setBigUint64(i*8,BigInt(w),true));
const fade={counter:0,start:bytes.getFloat32(0xb4,true),duration:bytes.getFloat32(0xb8,true),secondsPerSample:bytes.getFloat32(0xf8,true)};
if(bytes.getUint32(0xc0,true)!==0)throw new Error('Initial fade counter must be zero');
const requiredFlags={'0x88':1,'0xb0':1,'0xbc':1,'0xbd':0,'0xfc':1};
const rows=first.spatialRows.map(row=>{
  if(row.tapWords.length!==20||row.words[4]%4)throw new Error('Unsupported spatial network');
  const taps=Array.from({length:5},(_,i)=>({start:row.tapWords[4*i],end:row.tapWords[4*i+1],c:from(row.tapWords[4*i+2]),g:from(row.tapWords[4*i+3])}));
  const state={vectors:row.words[4]/4,counter:taps[0].end,taps,ring:new Float32Array(row.words[4])};
  if(row.words[8]!==state.counter)throw new Error('Unsupported initial spatial counter');
  check('initialSpatialZeroRing',state.ring,row.ring);
  return state;
});
const computed=new Map(source.predictions.map(r=>[r.ordinal,r.consumerGroups]));
if(computed.size!==data.ordinalLimit||rows.length!==3)throw new Error('Missing computed consumer output');
let roundTripDifferences=0;
for(let ordinal=0;ordinal<data.ordinalLimit;ordinal++){
  const block=data.records.slice(ordinal*4,ordinal*4+4);
  for(let i=0;i<4;i++)if(block[i].stage!==stages[i]||block[i].ordinal!==ordinal||block[i].groups.length!==3)throw new Error('Missing/reordered tail stage');
  const [before,nonlinear,filtered,expanded]=block;
  for(const record of block){
    for(const [name,value]of Object.entries(requiredFlags))if(record.spatialFlags[name]!==value)throw new Error('Unsupported spatial branch');
    if(record.controls['0x29f8']!==0||record.controls['0x29fc']!==0)throw new Error('Tail nonlinearity unverified');
    if(record.rowGains.slice(0,3).some(g=>g!==1))throw new Error('Nonunit row level not covered');
  }
  const input=computed.get(ordinal);
  if(!input||input.length!==3||input.some(g=>g.length!==64))throw new Error('Invalid calculated input');
  for(let g=0;g<3;g++)check(`${ordinal}:${g}:input`,input[g],before.groups[g].values[0]);
  // The active-group sleep optimization is not part of this observed window.
  if(input.some(g=>Math.max(...g.map(Math.abs))<1e-7))throw new Error('Silent spatial-group branch unverified');
  const merged=combineThenRestoreGroups(input);
  check(`${ordinal}:merged`,merged.combined,nonlinear.groups[0].values[0]);
  roundTripDifferences+=merged.groups[0].reduce((n,v,i)=>n+(bits(v)!==bits(input[0][i])),0);
  const spatial=spatializeVoiceGroups(merged.groups,rows,fade);
  for(let g=0;g<3;g++)for(let row=0;row<3;row++)check(`${ordinal}:${g}:${row}:spatial`,spatial[g][row],filtered.groups[g].values[row]);
  if(before.aux.values.length!==3)throw new Error('Missing observed auxiliary source rows');
  for(let row=0;row<3;row++)check(`${ordinal}:${row}:auxPreserved`,before.aux.values[row],filtered.aux.values[row]);
  const split=distributeAuxiliary(spatial[0],before.aux.values,before.controls['0x94']);
  const final=[split.primary,...spatial.slice(1)];
  for(let g=0;g<3;g++)for(let row=0;row<3;row++)check(`${ordinal}:${g}:${row}:final`,final[g][row],expanded.groups[g].values[row]);
  for(let row=0;row<3;row++){
    check(`${ordinal}:${row}:auxSplit`,split.auxiliary[row],expanded.aux.values[row]);
    if(rows[row].counter!==(expanded.spatialRows[row].words[8]>>>0))throw new Error('Spatial write counter mismatch');
    if(expanded.spatialRows[row].ring)check(`${ordinal}:${row}:ring`,rows[row].ring,expanded.spatialRows[row].ring);
    if(before.spatialRows[row].tapWords.some((v,i)=>v!==first.spatialRows[row].tapWords[i]))throw new Error('Spatial coefficients changed');
  }
  expanded.processorWords.forEach((w,i)=>bytes.setBigUint64(i*8,BigInt(w),true));
  if(fade.counter!==bytes.getUint32(0xc0,true))throw new Error('Fade counter mismatch');
  predictions.push({ordinal,groups:final.map(matrix=>matrix.map(row=>[...row])),auxiliary:split.auxiliary.map(row=>[...row])});
}
const count=checks.reduce((n,c)=>n+c.count,0),mismatches=checks.reduce((n,c)=>n+c.mismatches,0);
const report={passed:mismatches===0,count,matched:count-mismatches,mismatches,windowComplete:true,blocks:data.ordinalLimit,
  roundTripDifferences,computedConsumerInputs:true,spatialRingsStartAtZero:true,spatialStateCarried:true,
  spatialCoefficientsStillObserved:true,auxiliarySourceStillObserved:true,upstreamFromSeparateVerifiedRun:true,
  finalStereoAudioVerified:false,completeVoiceOrBrowserEquivalence:false,predictions,checks,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,predictions:undefined,checks:undefined,failures:undefined}));
if(!report.passed)process.exitCode=1;
