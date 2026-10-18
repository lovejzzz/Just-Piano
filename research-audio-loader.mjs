export async function createResearchNode(context,{onProgress,onStats,onError}){
 await context.resume();
 const worker=new Worker('./research-model-worker.mjs',{type:'module'});
 let node,silent;
 try{
  const model=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('研究模型准备超时')),120000);
   worker.onerror=event=>{clearTimeout(timer);reject(new Error(event.message));};
   worker.onmessage=({data})=>{
    if(data.type==='progress')onProgress(data);
    else if(data.type==='error'){clearTimeout(timer);reject(new Error(data.message));}
    else if(data.type==='model'){clearTimeout(timer);resolve(data.model);}
   };
   worker.postMessage({sampleRate:context.sampleRate});
  });
  await context.audioWorklet.addModule('./research-piano-worklet.mjs');
  node=new AudioWorkletNode(context,'just-piano-research',{numberOfInputs:0,outputChannelCount:[2]});
  silent=context.createGain();silent.gain.value=0;node.connect(silent).connect(context.destination);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('研究 AudioWorklet 启动超时')),15000);
   node.port.onmessage=({data})=>{
    if(data.type==='ready'){clearTimeout(timer);resolve();}
    else if(data.type==='error'){clearTimeout(timer);reject(new Error(data.message));onError?.(new Error(data.message));}
    else if(data.type==='stats')onStats(data);
   };
   node.onprocessorerror=()=>{clearTimeout(timer);const error=new Error('研究 AudioWorklet 运行失败');reject(error);onError?.(error);};
   const buffers=[];for(const n of model.notes)for(const value of Object.values(n))if(ArrayBuffer.isView(value))buffers.push(value.buffer);
   for(const entry of model.bank)buffers.push(entry.samples.buffer);
   node.port.postMessage({type:'model',model},buffers);
  });
  node.disconnect();silent.disconnect();return node;
 }catch(error){node?.disconnect();silent?.disconnect();throw error;}
 finally{worker.terminate();}
}
