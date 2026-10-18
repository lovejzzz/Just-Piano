// Live experimental adapter around the recovered source/kernel/wavelet modules.
// The remaining voice-control and mix bridge is deliberately not called native-equivalent.
import {renderSixteen} from './modal-kernel.mjs';
import {smallExpPolynomial} from './modal-coefficients.mjs';
import {selectAuxiliarySource} from './auxiliary-source-selection.mjs';
import {initializeVoiceDetune} from './voice-initial-random.mjs';
const f=Math.fround,MAX_VOICES=24,LANE_BUDGET=2048;
export class RealtimeResearchEngine {
 constructor(model){
  if(model?.schema!=='just-piano-live-research-v1'||model.sampleRate!==48000||model.inputContract!=='model-preset-only'||model.notes.length!==88||model.nativeSnapshotsUsed!==false||model.renderedNoteAudioUsed!==false)throw new Error('Complete input-only 88-key research model required');
  this.sampleRate=model.sampleRate;this.notes=new Map(model.notes.map(n=>[n.note,n]));this.bank=new Map(model.bank.map(r=>[r.identity,r]));
  this.params={hardness:.35,unison:.35,decay:1,resonance:.32,curve:1};this.sustain=false;this.soft=0;this.serial=0;this.frames=0;this.noteStarts=0;this.nonfinite=0;
  const maximum=Math.max(...model.notes.map(n=>n.P.length));
  this.voices=Array.from({length:MAX_VOICES},()=>{
   const arrays=Array.from({length:4},()=>new Float32Array(maximum));
   return {active:false,arrays,groups:Array.from({length:maximum/16},(_,g)=>arrays.map(a=>a.subarray(g*16,g*16+16))),
    workspace:Array.from({length:4},()=>new Float32Array(16)),output:new Float32Array(128)};
  });
  this.body=Array.from({length:24},(_,i)=>{const angle=2*Math.PI*440*2**((36+i*2-69)/12)/this.sampleRate;return {p:0,q:0,a:-.9996,b:2*Math.cos(angle)*.9998};});
 }
 message(message){
  if(message.type==='on')this.noteOn(message.note,message.vel);
  else if(message.type==='off')this.noteOff(message.note);
  else if(message.type==='sustain'){this.sustain=!!message.on;this.refreshAll();}
  else if(message.type==='soft')this.soft=Math.max(0,Math.min(1,Number(message.value)||0));
  else if(message.type==='param'&&Number.isFinite(message.value)){
   const ranges={hardness:[0,1],unison:[0,1],decay:[.4,1.8],resonance:[0,1],curve:[.5,2]};
   const range=ranges[message.key];if(range){this.params[message.key]=Math.max(range[0],Math.min(range[1],message.value));if(message.key==='decay')this.refreshAll();}
  }else if(message.type==='allOff'){for(const v of this.voices)v.active=false;this.sustain=false;for(const r of this.body)r.p=r.q=0;}
 }
 refresh(v){
  const [, , A,B]=v.arrays,t=v.template;
  const closed=!v.held&&!this.sustain&&v.note<=89;
  for(let i=0;i<v.lanes;i++){
   const frequency=t.frequency[i],d=t.damping;
   const band=Math.max(0,Math.min(1,(frequency-d.releaseLow)/(d.releaseHigh-d.releaseLow)));
   const damper=closed?(55+55*band)*d.releaseShape:0;
   const loss=Math.max(.05,t.decay[i])/this.params.decay+damper;
   const radius=smallExpPolynomial(f(-loss/this.sampleRate));
   A[i]=f(-radius*radius);B[i]=f(f(t.cosine[i]+t.cosine[i])*radius);
  }
 }
 refreshAll(){for(const v of this.voices)if(v.active)this.refresh(v);}
 noteOn(note,velocity){
  if(!this.notes.has(note)||!Number.isFinite(velocity))return;
  if(velocity<=0)return this.noteOff(note);
  const template=this.notes.get(note);
  // Bound total modal work rather than silently dropping notes in the low register.
  let active=this.voices.filter(v=>v.active),lanes=active.reduce((n,v)=>n+v.lanes,0);
  while(lanes+template.P.length>LANE_BUDGET||active.length>=MAX_VOICES){
   active.sort((a,b)=>(a.held-b.held)||(a.level-b.level)||(a.stamp-b.stamp));const old=active.shift();if(!old)break;old.active=false;lanes-=old.lanes;
  }
  const v=this.voices.find(v=>!v.active);if(!v)return;
  Object.assign(v,{active:true,held:true,note,template,lanes:template.P.length,age:0,attackEnvelope:1,stamp:this.serial++,level:1});
  const strength=Math.pow(Math.max(0,Math.min(1,velocity/127)),this.params.curve)*(1-.35*this.soft);
  v.gain=.1*strength*strength;
  this.refresh(v);
  const [P,Q,A]=v.arrays;
  const cutoff=700+9000*(.15+this.params.hardness*.85)*(.2+strength*.8);
  for(let i=0;i<v.lanes;i++){
   const ratio=template.frequency[i]/cutoff,square=ratio*ratio;
   const hammer=1/(1+square*square),component=i%template.columns;
   const unison=component===0?1:this.params.unison*2;
   const amplitude=f(hammer*unison);
   P[i]=f(template.P[i]*amplitude);Q[i]=f(f(template.Q[i]*amplitude)*Math.sqrt(-A[i]));
  }
  const seed=(12345+v.stamp)>>>0;let word=seed;const state=[word];for(let i=0;i<3;i++){word=(Math.imul(word,0x41c64e6d)+0x3039)>>>0;state.push(word);}
  v.attacks=[];let randomState=state;
  for(let row=0;row<3;row++){
   const random=initializeVoiceDetune({scale:.35,randomState});randomState=random.randomState;
   const chosen=selectAuxiliarySource(this.bank,{note,detune:random.value,variant:row});
   v.attacks.push({primary:this.bank.get(chosen.primary).samples,secondary:chosen.secondary?this.bank.get(chosen.secondary).samples:null,a:chosen.primaryWeight,b:chosen.secondaryWeight});
  }
  this.noteStarts++;
 }
 noteOff(note){for(const v of this.voices)if(v.active&&v.note===note){v.held=false;this.refresh(v);}}
 render(left,right){
  if(left.length!==128||right.length!==128)throw new RangeError('128-frame Web Audio quantum required');
  left.fill(0);right.fill(0);
  for(const v of this.voices){
   if(!v.active)continue;
   const out=v.output;out.fill(0);
   for(let g=0;g<v.lanes/16;g++)renderSixteen(...v.groups[g],out,v.workspace);
   const attackGain=.08*(.2+this.params.hardness*.8),pan=(v.note-64)/180;
   let peak=0;
   for(let i=0;i<128;i++){
    let attack=0;const age=v.age+i;
    if(!v.held&&!this.sustain&&v.note<=89)v.attackEnvelope*=.997;
    for(const row of v.attacks)if(age<row.primary.length)attack+=(row.primary[age]*row.a+(row.secondary?.[age]??0)*row.b)/3;
    const onset=Math.min(1,age/48),sample=(out[i]*onset+attack*attackGain*v.attackEnvelope)*v.gain;
    left[i]+=sample*(.707-pan);right[i]+=sample*(.707+pan);peak=Math.max(peak,Math.abs(sample));
   }
   v.level=peak;v.age+=128;
   if((v.age>96000&&peak<1e-7)||v.age>this.sampleRate*30)v.active=false;
  }
  const resonance=this.params.resonance*.002;
  for(let i=0;i<128;i++){
   const input=(left[i]+right[i])*.5;let body=0;
   for(const r of this.body){const q=input+r.b*r.q+r.a*r.p;r.p=r.q;r.q=q;body+=q-r.p;}
   let l=left[i]+body*resonance,r=right[i]+body*resonance;
   if(!Number.isFinite(l)||!Number.isFinite(r)){l=r=0;this.nonfinite++;}
   left[i]=Math.tanh(l);right[i]=Math.tanh(r);
  }
  this.frames+=128;
 }
 statistics(){return {frames:this.frames,noteStarts:this.noteStarts,activeVoices:this.voices.filter(v=>v.active).length,nonfinite:this.nonfinite,engine:'research-live',nativeFullVoiceEquivalent:false};}
}
