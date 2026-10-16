// Runtime dispatch controls, observed immediately before the native branches.
// These select whether the current source reaches the modal setter; they do
// not generate buffer readiness or infer a route from the modal target value.
export function rattleDispatchRoute(kind,flag,multi){
 if(!Number.isInteger(flag)||flag<0||flag>0xffffffff)throw new Error('Invalid dispatch flag');
 if(kind==='entry'){
  if(multi!==null)throw new Error('Entry gate has no multi-voice argument');
  return flag&1?'buffer':'skip';
 }
 if(multi!==0&&multi!==1)throw new Error('Invalid multi-voice argument');
 if(kind==='buffer')return flag&1?'ready':multi?'skip':'commit';
 if(kind==='ready')return flag&1||!multi?'commit':'skip';
 throw new Error('Unknown source dispatch gate');
}
