// 951204..951240: reciprocal sample rate, configured block length, and the
// immutable (factor, initial phase) pair (1,0) at binary literal b41a30.
// Render configuration is supplied explicitly; no native snapshot is read.
const f=Math.fround;
export function modalRenderConfiguration({sampleRate,blockSize}={}){
 if(!Number.isFinite(sampleRate)||!Number.isFinite(f(sampleRate))||f(sampleRate)<=1000||
    !Number.isInteger(blockSize)||blockSize<4||blockSize>512||blockSize%4)
  throw Error('Finite native-rate range and complete four-sample modal blocks required');
 const rate=f(sampleRate),timestep=f(1/rate);
 if(!(timestep>0))throw Error('Representable positive timestep required');
 return Object.freeze({sampleRate:rate,samples:blockSize,timestep,blockLength:blockSize,blockFactor:1,initialPhase:0});
}
