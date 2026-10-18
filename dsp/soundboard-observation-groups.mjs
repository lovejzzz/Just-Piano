import {constructSoundboardObservationDistances} from './soundboard-observation-distance.mjs';
import {prepareSoundboardObservations} from './soundboard-observation.mjs';
import {sortSoundboardObservationRecords} from './soundboard-observation-sort.mjs';
const f = Math.fround;

export function constructSoundboardObservationGroups({grid, geometry, gains, planeHeight, speed, steps, flags, phaseMode}) {
  if (!Array.isArray(geometry) || !geometry.length || !(gains instanceof Float32Array) || gains.length !== 3 ||
      gains.some(v=>!Number.isFinite(v)) || !Number.isFinite(speed) || speed<=0 || !Number.isInteger(steps) || steps<1 ||
      geometry.some(g=>!Number.isInteger(g.channel)||g.channel<0||g.channel>=64||
        !Number.isInteger(g.kind)||g.kind<0||g.kind>2||!Number.isFinite(g.amplitude))) throw new RangeError('Valid observation geometry and controls required');
  const coordinates = geometry.map(g=>g.coordinates);
  const result = constructSoundboardObservationDistances(grid, coordinates, planeHeight);
  const channelCount = Math.max(...geometry.map(g=>g.channel)) + 1;
  const channels = Array.from({length:channelCount},()=>[]), inverseScale=f(1/f(f(speed)*grid.tau));
  geometry.forEach((g,i)=>{
    const begin=i*grid.size,end=begin+grid.size;
    channels[g.channel].push(...prepareSoundboardObservations({inverseScale, amplitudeScale:f(gains[g.kind]*g.amplitude),
      flags,phaseMode,frequencies:result.distances.subarray(begin,end),coefficients:result.directions.subarray(begin,end)}));
  });
  let maxDelay=0;
  for(const channel of channels)for(const entry of channel)maxDelay=Math.max(maxDelay,entry.stateIndex+1);
  const length=steps+maxDelay+64;
  if(!Number.isSafeInteger(length)||length>10000000)throw new RangeError('Observation output length exceeds bound');
  const sortReports=[];
  const observations=channels.map(channel=>{
    if(!channel.length)throw new RangeError('Empty observation channel unsupported');
    const sorted=sortSoundboardObservationRecords(channel);sortReports.push(sorted.branches);
    const groups=[];
    for(const entry of sorted.records){
      if(!groups.length||groups.at(-1).offset!==entry.stateIndex)groups.push({offset:entry.stateIndex,entries:[]});
      groups.at(-1).entries.push({stateIndex:entry.frequencyIndex,a:entry.phaseWeight,b:entry.first,c:entry.second});
    }
    return {length,groups};
  });
  return {...result,observations,sortReports,maxDelay};
}
