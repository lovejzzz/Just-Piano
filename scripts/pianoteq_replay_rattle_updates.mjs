import fs from 'node:fs';
import {releaseCoefficients} from '../dsp/physical-controls.mjs';
const [capture,output,...extra]=process.argv.slice(2);
if(!capture||!output||extra.length)throw new Error('Usage: capture.json report.json');
const d=JSON.parse(fs.readFileSync(capture,'utf8'));
if(d.schema!==1||d.fixedSites!==true||d.siteCount!==6||!d.complete||d.pending||d.activeSites!==0||d.errors.length||d.starts!==5||!d.updateCount||d.setterCount<5||!d.coefficientCount)throw new Error('Complete dynamic Rattle capture required');
const f=Math.fround,view=new DataView(new ArrayBuffer(4)),bits=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite x/control');view.setFloat32(0,x);return view.getUint32(0);};
const owners=new Map(),voices=new Map(),pending=new Map(),epochs=new Set(),failures=[],byStage={};let checks=0,mismatches=0,starts=0,updates=0,setters=0,coefficients=0,active=0,xChanges=0;
function check(name,p,a){checks++;if(bits(p)!==bits(a)){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
function voice(r){const s=voices.get(r.epoch);if(!s||s.voice!==r.voice||owners.get(r.voice)!==r.epoch)throw new Error('Unbound voice epoch');if(r.modal&&BigInt(r.modal)!==BigInt(r.voice)+0x168n)throw new Error('Invalid modal owner');return s;}
for(const r of d.records){
 byStage[r.stage]=(byStage[r.stage]??0)+1;
 if(r.stage==='source'){
  if(r.epoch!==starts||!Number.isFinite(r.sourceX)||r.sourceX<0||r.sourceX>1)throw new Error('Invalid source chronology');
  const x=f(r.sourceX);check('source:initial',x,r.initialX);voices.set(starts,{voice:r.voice,owner:r.owner,initial:x,current:x,modal:0,set:false});owners.set(r.voice,starts);starts++;
 }else if(r.stage==='updateA'||r.stage==='updateB'){
  const s=voice(r);if(r.owner!==s.owner||!Number.isFinite(r.sourceX)||r.sourceX<0||r.sourceX>1)throw new Error('Unbound source update');
  const x=f(r.sourceX);check('update:current',x,r.currentX);if(bits(x)!==bits(s.current))xChanges++;s.current=x;updates++;
 }else if(r.stage==='setter'){
  const s=voice(r);if(!['0x1007184b0','0x100460260'].includes(r.caller))throw new Error('Unsupported x setter caller');
  const x=r.caller==='0x1007184b0'?s.initial:s.current;
  check('setter:source',x,r.sourceX);check('setter:argument',x,r.argument);check('setter:modal',x,r.modalX);s.modal=x;s.set=true;setters++;
 }else if(r.stage==='active'){
  const s=voice(r);if(!s.set||pending.has(r.thread))throw new Error('Unbound or overlapping active coefficient read');
  check('active:modal',s.modal,r.modalX);check('active:cube',f(s.modal*f(s.modal*s.modal)),r.cube);
  pending.set(r.thread,{epoch:r.epoch,voice:r.voice,modal:r.modal,x:s.modal,inputs:r.inputs});active++;
 }else if(r.stage==='coefficients'){
  const s=voice(r),p=pending.get(r.thread);if(r.active!==!!p)throw new Error('Active branch pairing differs');
  check('result:current-modal',s.modal,r.modalX);
  let v={duration:0,rate:0,gain:0};
  if(p){if(p.epoch!==r.epoch||p.voice!==r.voice||p.modal!==r.modal)throw new Error('Unmatched active output');v=releaseCoefficients({...p.inputs,x:p.x,u:r.u});pending.delete(r.thread);}
  for(const k of ['duration','rate','gain'])check(k,v[k],r.actual[k]);epochs.add(r.epoch);coefficients++;
 }else throw new Error('Unknown update stage');
}
if(starts!==5||voices.size!==5||epochs.size!==5||updates!==d.updateCount||setters!==d.setterCount||coefficients!==d.coefficientCount||!active||!xChanges||pending.size)throw new Error('Incomplete dynamic update chain');
const report={passed:!mismatches,checks,mismatches,starts,updates,setters,coefficients,active,xChanges,byStage,sourceControlObserved:true,voiceAndModalXStateCarried:true,cubeAndCoefficientXTargetsComparisonOnly:true,coefficientBranchExecutionUAndModelFieldsObserved:true,continuousEnvelopeAndVoiceOrBrowserEquivalence:false,failures};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
