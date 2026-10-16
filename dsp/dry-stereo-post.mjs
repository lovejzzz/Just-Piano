// Fixed dry profile: auxiliary sum, empty EQ, inactive room wet path, stereo route and settled level.
import {renderEmptyGlobalFilter,mixInactiveRoom} from './settled-global-processing.mjs';
import {createRoutedDelayCache,routeConstantBlock,readRoutedBlock} from './routed-delay-cache.mjs';
import {applySettledOutputLevel} from './output-level.mjs';
export class DryStereoPost64 {
 constructor(seed){
  if(seed.hasConvolution||seed.hasExternal||seed.spatialEnabled||seed.filters.length!==3||seed.dryGains.length!==3||seed.wetGains.length!==3||seed.wetGains.some(x=>x!==0))throw new Error('Active room processing not covered');
  this.filters=seed.filters.map(s=>({...s,level:s.level.slice()}));this.dry=seed.dryGains.slice();this.wet=seed.wetGains.slice();this.level=seed.level.slice();
  this.cache=createRoutedDelayCache(seed.stereoCache);this.wrap=!!seed.stereoMapping.wrap;
  const view=new DataView(new ArrayBuffer(4)),from=x=>{view.setUint32(0,x);return view.getFloat32(0);};
  this.entries=seed.stereoMapping.entries.map(e=>({...e,taps:Array.from({length:e.tapWords.length/6},(_,i)=>{
   const w=e.tapWords.slice(i*6,i*6+6).map(from);return {delay:w[0],startGain:w[1],endGain:w[2],multiplier:w[4]};
  })}));
  if(this.cache.rings.length!==2||this.entries.some(e=>e.source>=3))throw new Error('Unverified stereo route');
 }
 process64(cabinet,auxiliary){
  if(cabinet.length!==3||auxiliary.length!==3||[...cabinet,...auxiliary].some(row=>row.length!==64))throw new Error('Three auxiliary/cabinet rows required');
  const summed=cabinet.map((row,j)=>Float32Array.from(row,(x,i)=>Math.fround(x+auxiliary[j][i])));
  const filtered=summed.map((row,j)=>renderEmptyGlobalFilter(row,this.filters[j]));
  const room=mixInactiveRoom(filtered,this.dry,this.wet),source=[...room,...Array.from({length:5},()=>new Float32Array(64))];
  routeConstantBlock(this.cache,source,this.entries,1,this.wrap);
  const stereo=readRoutedBlock(this.cache);
  return {output:applySettledOutputLevel(stereo,this.level),summed,room,stereo};
 }
}
