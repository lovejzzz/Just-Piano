// 6da4b4 rejection sampling and 765a30 twelve-uniform detune initialization.
// Only finite numerical configurations (modes 0/1) are implemented.
import {nextExcitationRandom} from './final-excitation.mjs';
import {fma32} from './modal-kernel.mjs';
const f = Math.fround;
function seedCopy(state) {
 if(!Array.isArray(state)||state.length!==4||!state.every(x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff))throw new RangeError('Four random uint32 words required');
 return [...state];
}
export function randomizeVoiceControl({value,config,randomState}) {
 const state=seedCopy(randomState);
 if(!Number.isFinite(value)||![config.lower,config.upper].every(Number.isFinite)||!Number.isInteger(config.enabled)||config.enabled<0)throw new RangeError('Finite random control required');
 value=f(value);
 if(!config.enabled)return {value,randomState:state,randomDraws:0,attempts:0};
 if(![0,1].includes(config.mode))throw new RangeError('Unrecovered nonnumerical random configuration');
 let a=config.mode===0?f(value+f(config.lower)):f(value*f(config.lower));
 let b=config.mode===0?f(value+f(config.upper)):f(value*f(config.upper));
 if(a>b)[a,b]=[b,a];
 if(value<a||value>b)a=b=value;
 const left=f(value-a),width=f(b-a),right=f(b-value);
 let candidate=value,attempts=0;
 for(;attempts<10;){
  attempts++;
  candidate=fma32(width,f(nextExcitationRandom(state)/4294967296),a);
  const u=f(nextExcitationRandom(state)/4294967296);
  if(candidate<=value){if(f(left*u)<=f(candidate-a))break;}
  else if(u<=f(1-f(f(candidate-value)/right)))break;
 }
 return {value:candidate,randomState:state,randomDraws:attempts*2,attempts};
}
export function initializeVoiceDetune({scale,randomState}) {
 const state=seedCopy(randomState);
 if(!Number.isFinite(scale))throw new RangeError('Finite detune scale required');
 scale=f(scale);
 if(scale<=0)return {value:0,randomState:state,randomDraws:0};
 let sum=0;
 for(let i=0;i<12;i++)sum=f(sum+f(nextExcitationRandom(state)/4294967296));
 return {value:f(scale*f(sum-6)),randomState:state,randomDraws:12};
}
// This bridges the observed numerical initialization branch only. Its generated
// controls are not yet connected to independent noise/filter audio processing.
export function advanceVoiceInitializationRandom({inputs:c,randomState}) {
 if(![c.base,c.detuneBase,c.detuneScale,c.detuneControl].every(Number.isFinite)||typeof c.halfBase!=='boolean'||![c.countA,c.countB].every(x=>Number.isInteger(x)&&x>=0&&x<=64)||![0,1].includes(c.noiseMode))throw new RangeError('Unsupported voice initialization controls');
 const distribution=randomizeVoiceControl({value:c.halfBase?f(f(c.base)*.5):f(c.base),config:c.distribution,randomState});
 let state=distribution.randomState,randomDraws=distribution.randomDraws;
 const detuneScale=fma32(f(c.detuneScale),f(f(c.detuneControl)+f(c.detuneControl)),f(c.detuneBase));
 const detunes=[];
 for(let i=0;i<Math.min(c.countA,c.countB);i++){
  const d=initializeVoiceDetune({scale:detuneScale,randomState:state});state=d.randomState;randomDraws+=d.randomDraws;detunes.push(d.value);
 }
 // 84141c returns early for noiseMode=1; otherwise its numerical mode 0
 // invokes the same rejection sampler at center zero.
 if(c.noiseMode!==1){
  if(c.noiseDistribution.mode!==0)throw new RangeError('Unrecovered alternate noise branch');
  const d=randomizeVoiceControl({value:0,config:c.noiseDistribution,randomState:state});state=d.randomState;randomDraws+=d.randomDraws;
 }
 return {randomState:state,randomDraws,distributionValue:distribution.value,distributionAttempts:distribution.attempts,detunes};
}
