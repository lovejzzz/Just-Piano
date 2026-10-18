import {RealtimeResearchEngine} from './dsp/realtime-research-engine.mjs';
class ResearchPianoProcessor extends AudioWorkletProcessor{
 constructor(){super();this.engine=null;this.quanta=0;this.overruns=0;this.maxMs=0;this.outputPeak=0;this.port.onmessage=({data})=>{
  try{if(data.type==='model'){this.engine=new RealtimeResearchEngine(data.model);this.port.postMessage({type:'ready',engine:'research-live'});}
   else this.engine?.message(data);
  }catch(error){this.port.postMessage({type:'error',message:error.message});}
 };}
 process(inputs,outputs){
  const out=outputs[0];if(!out?.[1])return true;
  if(this.engine){
   const start=Date.now();this.engine.render(out[0],out[1]);const elapsed=Date.now()-start;
   for(const channel of out)for(const value of channel)this.outputPeak=Math.max(this.outputPeak,Math.abs(value));
   this.maxMs=Math.max(this.maxMs,elapsed);if(elapsed>128/sampleRate*1000)this.overruns++;
   if(++this.quanta%187===0)this.port.postMessage({type:'stats',...this.engine.statistics(),outputPeak:this.outputPeak,maxRenderMs:this.maxMs,coarseDeadlineOverruns:this.overruns});
  }
  return true;
 }
}
registerProcessor('just-piano-research',ResearchPianoProcessor);
