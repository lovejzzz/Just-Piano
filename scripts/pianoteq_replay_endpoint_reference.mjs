// Historical generated/normalized captures: explicit observed endpoint tables,
// independently computed reference and amplitude normalization. Not new audio.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {prepareModalInputs} from '../dsp/modal-source.mjs';
import {prepareEndpointSourceTables} from '../dsp/endpoint-source-reference.mjs';
const [generatedPath,normalizedPath,output]=process.argv.slice(2);
if(!output)throw new Error('Generated capture, normalized capture and NEW report required');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function load(file){
  const bytes=fs.readFileSync(file),manifest=JSON.parse(fs.readFileSync(path.join(path.dirname(file),'sha256-manifest.json')));
  if(manifest[path.basename(file)]!==sha(bytes))throw new Error('Capture SHA differs from its manifest');
  const wav=fs.readFileSync(path.join(path.dirname(file),'observed.wav'));
  if(manifest['observed.wav']!==sha(wav))throw new Error('Historical observed WAV SHA differs');
  const data=JSON.parse(bytes);
  if(data.errors.length||data.records.length!==2)throw new Error('Exactly two complete source records required');
  return {data,sha256:sha(bytes),observedWavSha256:sha(wav)};
}
const generated=load(generatedPath),normalized=load(normalizedPath);
if(generated.data.point!=='0x1007a4784'||normalized.data.point!=='0x1007a48d4'||normalized.data.stage!=='normalized')
  throw new Error('Wrong source boundary captures');
if(generated.observedWavSha256!==normalized.observedWavSha256)throw new Error('Historical runs produced different WAVs');
const view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const failures=[],checks=[];let normalizedAmplitudeValues=0,unchangedMatrixValues=0,referenceIndices=0;
function equalArray(a,b,stage){
  if(a.length!==b.length){failures.push({stage,reason:'length'});return;}
  for(let i=0;i<a.length;i++)if(bits(a[i])!==bits(b[i]))failures.push({stage,index:i,reason:'float-bits'});
}
for(let mode=0;mode<2;mode++){
  const left=generated.data.records.filter(r=>r.mode===mode),right=normalized.data.records.filter(r=>r.mode===mode);
  if(left.length!==1||right.length!==1)throw new Error('Unique primary and secondary sources required');
  const a=left[0],b=right[0],expectedRows=mode===0?26:10;
  for(const r of [a,b]){
    if(r.note!==69||r.note_index!==69||r.cache_controls['0x270']!==1||r.component_count!==3)
      throw new Error('Unsupported historical source context');
    for(const offset of ['0x400','0x418','0x430','0x448','0x460','0x478'])
      if(r.G_controls[offset]!==0)throw new Error('Later phase offsets require their own implementation');
    for(const m of Object.values(r.matrices))if(m.rows!==expectedRows||m.cols!==3||m.values.length!==expectedRows*3)
      throw new Error('Incomplete historical source shape');
  }
  for(const group of ['cache_controls','G_controls','cache_vectors','G_vectors']){
    if(JSON.stringify(Object.keys(a[group]))!==JSON.stringify(Object.keys(b[group])))throw new Error('Capture field sets differ');
    for(const key of Object.keys(a[group]))equalArray(Array.isArray(a[group][key])?a[group][key]:[a[group][key]],
      Array.isArray(b[group][key])?b[group][key]:[b[group][key]],group+key);
  }
  for(const offset of ['0x10','0x38','0x88']){
    equalArray(a.matrices[offset].values,b.matrices[offset].values,'unchanged'+offset);
    unchangedMatrixValues+=a.matrices[offset].values.length;
  }
  const g=a.G_controls,c=a.cache_controls,v=a.G_vectors;
  const prepared=prepareModalInputs({frequency:g['0x78'],offsets:v['0x120'],offsetExponent:c['0x1a0'],
    stiffness:g['0x28'],componentStiffness:v['0x40'],spread:g['0x148'],frequencyRatios:a.cache_vectors['0x1f8'],blend:c['0x270']});
  const coupled={rows:expectedRows,columns:3,frequency:a.matrices['0x10'].values,decay:a.matrices['0x38'].values,
    amplitude:a.matrices['0x60'].values,phase:a.matrices['0x88'].values};
  const own=prepareEndpointSourceTables({coupled,prepared});
  equalArray(own.normalizedAmplitude,b.matrices['0x60'].values,'normalized-amplitude');
  normalizedAmplitudeValues+=own.normalizedAmplitude.length;referenceIndices++;
  if(own.referenceIndex!==a.reference_index||own.referenceIndex!==b.reference_index)failures.push({stage:'reference-index',mode});
  checks.push({mode,rows:expectedRows,columns:3,referenceFrequency:own.referenceFrequency,referenceIndex:own.referenceIndex,
    maximum:own.normalizationMaximum,scale:own.normalizationScale});
}
const report={passed:failures.length===0,failures,checks,normalizedAmplitudeValues,unchangedMatrixValues,referenceIndices,
  generatedSha256:generated.sha256,normalizedSha256:normalized.sha256,historicalObservedWavSha256:generated.observedWavSha256,
  scope:'Cross-run historical endpoint tables/controls remain observed; normalization and reference newly computed',
  nativeIntermediateBlendTrajectoryVerified:false,newAudioRendered:false,wholeIndependentAudioVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
