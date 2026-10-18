import {prepareLiveModel} from './dsp/live-model-preparation.mjs';
self.onmessage=async ({data})=>{
 try{
  const response=await fetch('/__local/live-model.json',{cache:'no-store'});if(!response.ok)throw new Error('本机模型不可用');
  const archive=await response.json();
  const model=await prepareLiveModel({...archive,sampleRate:data.sampleRate,onProgress:progress=>postMessage({type:'progress',...progress})});
  const buffers=new Set();
  for(const n of model.notes)for(const value of Object.values(n))if(ArrayBuffer.isView(value))buffers.add(value.buffer);
  for(const entry of model.bank)buffers.add(entry.samples.buffer);
  postMessage({type:'model',model},[...buffers]);
 }catch(error){postMessage({type:'error',message:error.message});}
};
