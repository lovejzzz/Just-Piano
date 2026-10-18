// 655e40..65608c: deterministic detail-band excitation before AR filtering.
// This is an intermediate generator, not the completed auxiliary waveform.
import {nextExcitationRandom} from './final-excitation.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
const f=Math.fround;
export function auxiliaryWaveletNoise(descriptor) {
 const {integerc:seed,scalar28:sampleRate,floats4,vector10,records50,floats48}=descriptor;
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Array.isArray(floats4)||floats4.length!==2||
    !Array.isArray(floats48)||floats48.length!==2||!Array.isArray(vector10)||!vector10.length||vector10.length>16||
    !Array.isArray(records50)||records50.length!==vector10.length||
    ![sampleRate,...floats4,...floats48,...vector10,...records50.map(r=>r.scalar0)].every(v=>Number.isFinite(v)&&Number.isFinite(f(v)))||
    sampleRate<=0||floats48[0]<=0||floats4[0]<0||floats4[0]>1||records50.some(r=>r.scalar0<0))throw new RangeError('Bounded finite wavelet source descriptor required');
 const frames=Math.max(16,Math.trunc(f(f(sampleRate)*f(floats48[0]))));
 if(frames>2000000)throw new RangeError('Wavelet source frame bound exceeded');
 const state=()=>{
  let word=seed>>>0;const words=[word];
  for(let i=0;i<3;i++){word=(Math.imul(word,0x41c64e6d)+0x3039)>>>0;words.push(word);}
  return words;
 };
 const bands=[];
 for(let band=vector10.length-1;band>=0;band--){
  let reconstructedLength=frames;
  for(let depth=0;depth<band;depth++)reconstructedLength=Math.floor((reconstructedLength+1)/2);
  const count=Math.floor(reconstructedLength/2);
  if(count<9)throw new RangeError('Wavelet band shorter than native reconstruction filters');
  const random=state(),raw=new Float32Array(count);
  for(let i=0;i<count;i++)raw[i]=f(f(f(nextExcitationRandom(random))/4294967296)-0.5);
  raw[0]=f(floats4[1]);
  const decay=f(records50[band].scalar0),firstDecay=f(decay*f(floats4[0]));
  const before=nativeScalarExp(f(-firstDecay)),after=nativeScalarExp(f(-f(decay-firstDecay)));
  const excitation=new Float32Array(count);let envelope=1;
  for(let i=0;i<count;i++){
   excitation[i]=f(envelope*raw[i]);
   const next=f(before*envelope);envelope=Math.abs(next)<1e-15?0:next;
  }
  bands.push({band,reconstructedLength,excitation,initialRandomState:state(),finalRandomState:random,
   beforeFilterDecay:before,afterFilterDecay:after,bandGainDb:f(vector10[band])});
 }
 return {frames,sampleRate:f(sampleRate),bands,fullWaveformImplemented:false};
}
