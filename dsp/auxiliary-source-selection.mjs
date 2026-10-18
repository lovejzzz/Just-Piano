// 918468 -> 8290f4: reflected pitch, adjacent keys and per-row variant modulo.
const f=Math.fround;
export function selectAuxiliarySource(bank,{note,detune,variant}){
 if(!(bank instanceof Map)||!bank.size||![note,detune].every(v=>Number.isFinite(v)&&Number.isFinite(f(v)))||
    !Number.isInteger(variant)||variant<0||variant>0xffffffff)throw new RangeError('Finite source pitch and unsigned variant required');
 const entries=[...bank.values()],keys=[...new Set(entries.map(r=>r.key))].sort((a,b)=>a-b);
 if(keys.length<2)throw new RangeError('Reflected source selection requires at least two keys');
 let pitch=f(f(note)+f(detune));const low=keys[0],high=keys.at(-1),period=f((high-low)*2);
 let turns=0;
 while(pitch<low){pitch=f(pitch+period);if(++turns>4096)throw new RangeError('Reflected pitch extent unsupported');}
 while(pitch>f(high+(high-low))){pitch=f(pitch-period);if(++turns>4096)throw new RangeError('Reflected pitch extent unsupported');}
 if(pitch>high)pitch=f(f(high-pitch)+high);
 let primaryKey,secondaryKey=null,primaryWeight=1;
 if(pitch<=low)primaryKey=low;
 else if(pitch>=high)primaryKey=high;
 else{
  const upper=keys.findIndex(k=>k>=pitch);primaryKey=keys[upper-1];secondaryKey=keys[upper];
  primaryWeight=f(1-f(f(pitch-primaryKey)/f(secondaryKey-primaryKey)));
  if(primaryWeight===1)secondaryKey=null;
 }
 const lookup=key=>{
  const variants=entries.filter(r=>r.key===key).sort((a,b)=>a.variant-b.variant);
  if(!variants.length||variants.some((r,i)=>r.variant!==i))throw new RangeError('Dense generated variants required');
  return variants[variant%variants.length];
 };
 let primary=lookup(primaryKey),secondary=secondaryKey===null?null:lookup(secondaryKey),secondaryWeight=secondary?f(1-primaryWeight):0;
 if(secondary&&secondary.samples.length>primary.samples.length){
  [primary,secondary]=[secondary,primary];[primaryWeight,secondaryWeight]=[secondaryWeight,primaryWeight];
 }
 return {pitch,primary:primary.identity,secondary:secondary?.identity??null,primaryWeight,secondaryWeight};
}
