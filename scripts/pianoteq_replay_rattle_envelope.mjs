import fs from 'node:fs';
import {ReleaseProgressEnvelope} from '../dsp/release-progress-envelope.mjs';
import {releaseCoefficients} from '../dsp/physical-controls.mjs';
const [capture,output,...extra]=process.argv.slice(2);
if(!capture||!output||extra.length)throw new Error('Usage: capture.json report.json');
const d=JSON.parse(fs.readFileSync(capture,'utf8'));
if(d.schema!==1||d.fixedSites!==true||d.siteCount!==6||!d.complete||d.pending||d.activeSites!==0||d.errors.length||d.starts!==5||!d.updateCount||!d.envelopeBlocks||d.envelopePending||!d.coefficientCount)throw new Error('Complete dynamic Rattle capture required');
const f=Math.fround,view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite x/control');view.setFloat32(0,x);return view.getUint32(0);};
const owners=new Map(),voices=new Map(),pending=new Map(),epochs=new Set(),failures=[],byStage={};const envelopes=new Map(),envelopePending=new Map(),envelopeCompleted=new Map(),coeffState=new Map();let blocks=0,duplicates=0;let checks=0,mismatches=0,starts=0,updates=0,coefficients=0,active=0,xChanges=0;
function check(name,p,a){checks++;if(bits(p)!==bits(a)){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
function voice(r){const s=voices.get(r.epoch);if(!s||s.voice!==r.voice||owners.get(r.voice)!==r.epoch)throw new Error('Unbound voice epoch');if(r.modal&&BigInt(r.modal)!==BigInt(r.voice)+0x168n)throw new Error('Invalid modal owner');return s;}
for(const r of d.records){
 byStage[r.stage]=(byStage[r.stage]??0)+1;
 if(r.stage==='source'){
  if(r.epoch!==starts||!Number.isFinite(r.sourceX)||r.sourceX<0||r.sourceX>1)throw new Error('Invalid source chronology');
  const x=f(r.sourceX);check('source:initial',x,r.initialX);voices.set(starts,{voice:r.voice,owner:r.owner,initial:x,current:x});owners.set(r.voice,starts);envelopes.set(starts,new ReleaseProgressEnvelope(0));coeffState.set(starts,{duration:0,rate:0,gain:0});starts++;
 }else if(r.stage==='updateA'){
  const s=voice(r);if(r.owner!==s.owner||!Number.isFinite(r.sourceX)||r.sourceX<0||r.sourceX>1)throw new Error('Unbound source update');
  const x=f(r.sourceX);check('update:current',x,r.currentX);if(bits(x)!==bits(s.current))xChanges++;s.current=x;updates++;
 }else if(r.stage==='active'){
  const s=voice(r);if(pending.has(r.thread))throw new Error('Unbound or overlapping active coefficient read');
  check('active:modal',s.current,r.modalX);check('active:cube',f(s.current*f(s.current*s.current)),r.cube);
  pending.set(r.thread,{epoch:r.epoch,voice:r.voice,modal:r.modal,x:s.current,inputs:r.inputs});active++;
 }else if(r.stage==='coefficients'){
  const s=voice(r),p=pending.get(r.thread);if(r.active!==!!p)throw new Error('Active branch pairing differs');
  check('result:current-modal',s.current,r.modalX);
  let v={duration:0,rate:0,gain:0};
  if(p){if(p.epoch!==r.epoch||p.voice!==r.voice||p.modal!==r.modal)throw new Error('Unmatched active output');v=releaseCoefficients({...p.inputs,x:p.x,u:r.u});pending.delete(r.thread);}
  for(const k of ['duration','rate','gain'])check(k,v[k],r.actual[k]);coeffState.set(r.epoch,v);epochs.add(r.epoch);coefficients++;
 }else if(r.stage==='envelope'){
  voice(r);if(envelopePending.has(r.thread))throw new Error('Overlapping envelope');
  const model=envelopes.get(r.epoch),c=coeffState.get(r.epoch);
  check('envelope:before',model.position,r.position);check('envelope:duration',c.duration,r.duration);
  if(((model.samplesProcessed+r.samples)>>>0)!==r.counter)throw new Error('Envelope counter discontinuity');
  const value=model.process({...r,duration:c.duration});envelopePending.set(r.thread,{...r,value});
 }else if(r.stage==='envelopeResult'){
  voice(r);const p=envelopePending.get(r.thread);
  if(!p||p.epoch!==r.epoch||p.modal!==r.modal||p.counter!==r.counter)throw new Error('Unbound envelope return');
  check('envelope:after',p.value,r.position);envelopePending.delete(r.thread);envelopeCompleted.set(r.thread,r);blocks++;
 }else if(r.stage==='duplicateEnvelopeResult'){
  voice(r);const p=envelopeCompleted.get(r.thread);
  if(envelopePending.has(r.thread)||!p||p.epoch!==r.epoch||p.voice!==r.voice||p.modal!==r.modal||p.counter!==r.counter||bits(p.position)!==bits(r.position))throw new Error('Unproven duplicate return');
  duplicates++;
 }else throw new Error('Unknown update stage');
}
if(starts!==5||voices.size!==5||epochs.size!==5||updates!==d.updateCount||duplicates!==(d.duplicateEnvelopeReturns??0)||blocks!==d.envelopeBlocks||envelopePending.size||coefficients!==d.coefficientCount||!active||!xChanges||pending.size)throw new Error('Incomplete dynamic update chain');
const report={passed:!mismatches,checks,mismatches,starts,updates,envelopeBlocks:blocks,duplicateEnvelopeReturns:duplicates,coefficients,active,xChanges,byStage,sourceControlObserved:true,voiceXStateCarried:true,setterSiteNotObservedThisWindow:true,envelopeStatesCarried:true,envelopeDurationComputed:true,baseDurationAndTimestepObserved:true,cubeAndCoefficientXTargetsComparisonOnly:true,coefficientBranchExecutionUAndModelFieldsObserved:true,continuousEnvelopeAndVoiceOrBrowserEquivalence:false,failures};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
