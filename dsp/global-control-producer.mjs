// 3ca148: verified mode-control update and coefficient refresh.
import {fma32} from './modal-kernel.mjs';
import {globalModeCoefficientArguments} from './global-modal-recurrence.mjs';
const f=Math.fround;
function bit(words,index){return Boolean(words[index>>6]&(1n<<BigInt(index%64)));}
function mark(words,index){words[index>>6]|=1n<<BigInt(index%64);}
export class GlobalControlProducer {
 constructor(initial){
  const {constants,identities,pairs}=initial.static;
  if(!Number.isInteger(initial.modeCount)||initial.modeCount<=0||[constants,identities,pairs,initial.dynamic].some(a=>a.length!==initial.modeCount))throw new Error('Invalid global mode control profile');
  this.constants=constants.map(row=>row.slice());this.identities=identities.map(row=>row.slice());this.pairs=pairs.map(row=>row.map(pair=>pair.slice()));
  this.dynamic=initial.dynamic.map(row=>row.slice());this.weightedModeCount=initial.weightedModeCount;this.timeScale=initial.timeScale;this.modeCount=initial.modeCount;
  this.refreshCount=0;this.limitedCount=0;this.weightedCount=0;this.externalMarks=0;this.internalMarksCarried=0;
  this.bitsets=initial.bitsets.map(s=>({...s,words:s.words.map(BigInt)}));
 }
 getBitsets(){return this.bitsets.map(s=>({...s,words:s.words.map(w=>'0x'+w.toString(16))}));}
 addDirtyModes(setIndex,indices){
  if((setIndex!==0&&setIndex!==1)||!Array.isArray(indices)||indices.some(i=>!Number.isInteger(i)||i<0||i>=this.modeCount))throw new Error('Invalid computed global dirty modes');
  if(indices.length){const set=this.bitsets[setIndex];for(const index of indices)mark(set.words,index);set.flag=0;}
 }
 process(controls){
  if(controls.modeCount!==this.modeCount||controls.weightedModeCount!==this.weightedModeCount||controls.timeScale!==this.timeScale||controls.bitsets.length!==2)throw new Error('Global control profile changed');
  const observed=controls.bitsets.map(s=>({...s,words:s.words.map(BigInt)})),n=this.modeCount;
  const sets=this.bitsets.map(s=>({...s,words:s.words.slice()}));
  if(sets.some(s=>s.count!==n||s.words.length!==Math.ceil(n/64)||(s.flag!==0&&s.flag!==1)))throw new Error('Invalid global dirty set');
  for(let i=0;i<2;i++){
   const own=sets[i],input=observed[i];
   if(input.pointer!==own.pointer||input.count!==own.count||input.words.length!==own.words.length)throw new Error('Dirty set owner changed');
   let added=false;
   for(let j=0;j<own.words.length;j++){
    if(own.words[j]&~input.words[j])throw new Error('Internal dirty marks disappeared');
    const external=input.words[j]&~own.words[j];
    for(let word=own.words[j];word;word&=word-1n)this.internalMarksCarried++;
    for(let word=external;word;word&=word-1n)this.externalMarks++;
    if(external){added=true;own.words[j]|=external;}
   }
   if(added)own.flag=0;
   if(input.flag!==own.flag)throw new Error('Dirty flag differs from carried state and new external marks');
  }
  const [a,b]=sets,updates=[];
  if(!(a.flag&1)){
   for(let i=0;i<n;i++)if(bit(a.words,i)){
    let value=1,flag=0;
    if(i<this.weightedModeCount){
     value=0;flag=1;
     for(const [key,weight] of this.pairs[i]){
      const control=controls.keys[key];if(!control||!Number.isFinite(control.value))throw new Error('Missing global key control');
      const product=f(weight*control.value);if(product>value)value=product;if(control.flag!==1)flag=0;
     }
     if(value>1)value=1;
    }
    this.dynamic[i][1]=value;this.dynamic[i][3]=flag;mark(b.words,i);b.flag=0;this.weightedCount++;
   }
   a.flag=1;a.words.fill(0n);
  }
  if(!(b.flag&1)){
   for(let i=0;i<n;i++)if(bit(b.words,i)){
    const row=this.dynamic[i],c=this.constants[i];
    const selected=row[3]!==0||!(row[1]<controls.globalControl)?row[1]:controls.globalControl;
    if(Math.abs(f(selected-row[2]))>0.001){
     row[2]=selected;let decay=fma32(selected,c[1],c[0]);
     if(f(decay-row[0])>c[6]){row[2]=-1;mark(a.words,i);a.flag=0;decay=f(row[0]+c[6]);this.limitedCount++;}
     row[0]=decay;
     const fields={'0xc':c[2],'0x10':c[3],'0x14':c[4],'0x18':c[5],'0x20':decay};
     updates.push({mode:i,kernel:this.identities[i][0],index:this.identities[i][1],arguments:globalModeCoefficientArguments(this.timeScale,fields)});this.refreshCount++;
    }
   }
   b.flag=1;b.words.fill(0n);sets.reverse();
  }
  this.bitsets=sets;return {updates,bitsets:this.getBitsets()};
 }
}
