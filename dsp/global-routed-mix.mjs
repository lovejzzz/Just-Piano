// Observed two-row global route, three-row branch sum and pre-CABN row mask.
import {createRoutedDelayCache,routeConstantBlock,readRoutedBlock} from './routed-delay-cache.mjs';
export class GlobalRoutedMix64 {
 constructor(seed,entries,wrap=false){
  if(seed.rings.length!==3||entries.length!==3)throw new Error('Unverified global route shape');
  this.cache=createRoutedDelayCache(seed);this.entries=entries;this.wrap=wrap;
 }
 process64(input,sum,gateEnabled,rowFlags){
  if(input.length!==2||sum.length!==3||[...input,...sum].some(row=>row.length!==64)||![0,1].includes(gateEnabled)||rowFlags.length!==3)throw new Error('Unverified global mix profile');
  routeConstantBlock(this.cache,input,this.entries,1,this.wrap);
  const delayed=readRoutedBlock(this.cache),mixed=delayed.map((row,j)=>Float32Array.from(row,(x,i)=>Math.fround(x+sum[j][i])));
  const output=mixed.map((row,j)=>gateEnabled&&!(rowFlags[j]&4)?new Float32Array(64):row.slice());
  return {delayed,mixed,output};
 }
}
