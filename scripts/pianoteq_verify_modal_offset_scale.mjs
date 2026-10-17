// System-libm validation of the prepared-source offset scale, not native piano audio.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {modalOffsetScale} from '../dsp/modal-source.mjs';
const [basePath,tuningPath,oraclePath,reportPath,...extra]=process.argv.slice(2);
if(!reportPath||extra.length)throw new Error('Usage: base-models.json verified-tuning.json system-powf-oracle new-report.json');
const baseBytes=fs.readFileSync(basePath),tuningBytes=fs.readFileSync(tuningPath),base=JSON.parse(baseBytes)[0],tuning=JSON.parse(tuningBytes);
const fields=base.fields.filter(f=>f.object_offset===0x1bec);if(fields.length!==1||!Number.isFinite(fields[0].value))throw new Error('Unique archived modal offset exponent required');
if(tuning.schema!=='pianoteq-source-tuning-pass17'||!tuning.passed||tuning.floatMismatches||tuning.uniqueNotes!==105||tuning.predictedSources?.length!==105)throw new Error('Complete verified tuning-source set required');
const v=new DataView(new ArrayBuffer(4)),bits=x=>{v.setFloat32(0,x);return v.getUint32(0).toString(16).padStart(8,'0');},decode=x=>{v.setUint32(0,parseInt(x,16));return v.getFloat32(0);};
const keys=new Set(),exponent=Math.fround(fields[0].value),cases=tuning.predictedSources.map(row=>{if(keys.has(row.key)||!Number.isFinite(row.frequency)||row.frequency<=0)throw new Error('Unique finite source frequencies required');keys.add(row.key);return {key:row.key,frequency:Math.fround(row.frequency),exponent,base:Math.fround(Math.fround(row.frequency)/440)};});
const run=spawnSync(oraclePath,[],{input:cases.map(c=>bits(c.base)+' '+bits(c.exponent)).join('\n')+'\n',encoding:'utf8',maxBuffer:1024*1024});if(run.error||run.status!==0||run.signal)throw new Error('Independent system powf oracle did not finish: '+(run.error?.message??run.stderr));
const outputs=run.stdout.trim().split(/\s+/);if(outputs.length!==cases.length||outputs.some(x=>!(/^[0-9a-f]{8}$/).test(x)))throw new Error('Complete system powf result words required');
let mismatches=0,mathPowMismatches=0;const checks=cases.map((c,i)=>{const predicted=modalOffsetScale(c.frequency,c.exponent),equal=bits(predicted)===outputs[i];if(!equal)mismatches++;if(bits(Math.fround(Math.pow(c.base,c.exponent)))!==outputs[i])mathPowMismatches++;return {...c,predicted,actual:decode(outputs[i]),predictedBits:bits(predicted),actualBits:outputs[i],equal};});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');const report={passed:mismatches===0,checks:checks.length,mismatches,mathPowMismatches,baseModelsSha256:hash(baseBytes),tuningReportSha256:hash(tuningBytes),systemOracleSha256:hash(fs.readFileSync(oraclePath)),systemMathOnly:true,newNativePianoCapture:false,pianoAudioVerified:false,rows:checks};fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,rows:undefined}));if(!report.passed)process.exitCode=1;
