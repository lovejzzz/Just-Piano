// 2bf88c constant-gain routing and the observed 64-sample lazy-cleared cache.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround;
export function createRoutedDelayCache(seed){
  return {sampleRate:seed.sampleRate,maximumDelay:seed.maximumDelay,rings:seed.rings.map(r=>{
    if(r.smallChunk!==64||r.bigChunk!==256||r.total!==r.flags.length*r.bigChunk||r.head%64||
       r.flags.some(v=>v!==15))throw new Error('Initial routing cache must be logically empty with the inspected chunk shape');
    return {...r,flags:Uint16Array.from(r.flags),data:new Float32Array(r.total)};
  })};
}
export function routeConstantBlock(cache,input,entries,gain=1,wrap=false){
  for(const entry of entries){
    if(entry.taps.length!==1)throw new Error('Variable/multiple routing taps unverified');
    const tap=entry.taps[0];
    if(tap.startGain!==tap.endGain||tap.delay>cache.maximumDelay||tap.delay<0)throw new Error('Unverified routing tap');
    const scale=f(f(gain*tap.startGain)*tap.multiplier);
    if(scale===0)continue;
    let source=entry.source;
    if(source>=input.length){if(!wrap)throw new Error('Routing source missing');source%=input.length;}
    const samples=input[source],ring=cache.rings[entry.destination];
    if(!ring||samples.length!==64)throw new Error('Invalid routed block shape');
    const delay=Math.ceil(f(cache.sampleRate*tap.delay));
    for(let i=0;i<samples.length;i++){
      const position=(ring.head+delay+i)%ring.total;
      const chunk=Math.floor(position/ring.bigChunk),part=Math.floor(position%ring.bigChunk/ring.smallChunk),bit=1<<part;
      if(ring.flags[chunk]&bit){
        const begin=chunk*ring.bigChunk+part*ring.smallChunk;
        ring.data.fill(0,begin,begin+ring.smallChunk);
        ring.flags[chunk]^=bit;
      }
      ring.data[position]=fma32(samples[i],scale,ring.data[position]);
    }
  }
}
export function readRoutedBlock(cache){
  return cache.rings.map(ring=>{
    const chunk=Math.floor(ring.head/ring.bigChunk),part=Math.floor(ring.head%ring.bigChunk/ring.smallChunk),bit=1<<part;
    const output=ring.flags[chunk]&bit ? new Float32Array(64) : ring.data.slice(ring.head,ring.head+64);
    ring.flags[chunk]|=bit;
    ring.head=(ring.head+64)%ring.total;
    return output;
  });
}
