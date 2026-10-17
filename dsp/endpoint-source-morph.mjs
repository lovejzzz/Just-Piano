// 1026dc intermediate branch: truncate endpoints to min rows, pair by row,
// morph each column, sort by its mixed frequency, apply indices to four tables.
import {endpointSineWeights,morphEndpointAmplitudes,endpointAmplitudeTypes,morphPairedEndpointPhases} from './endpoint-morph.mjs';
import {sortEndpointFrequencyIndices} from './endpoint-frequency-sort.mjs';
import {fma32} from './modal-kernel.mjs';
const fields=['frequency','decay','amplitude','phase'];
function check(source){
  if(!source||!Number.isInteger(source.rows)||source.rows<0||!Number.isInteger(source.columns)||source.columns<1)
    throw new RangeError('Explicit endpoint rows and positive columns required');
  const size=source.rows*source.columns;
  for(const field of fields){
    if(source[field]?.length!==size)throw new RangeError('Complete row-major endpoint '+field+' required');
    for(const value of source[field])if(!Number.isFinite(Math.fround(value))||(field==='amplitude'&&value<0))
      throw new RangeError('Finite endpoint data and nonnegative amplitudes required');
  }
}
export function morphEndpointSources({coupled,separate,blend}){
  const t=Math.fround(blend);
  if(!Number.isFinite(t)||t<0||t>1)throw new RangeError('Float32 blend in [0,1] required');
  if(t===0||t===1){
    const selected=t===1?coupled:separate;check(selected);
    return {rows:selected.rows,columns:selected.columns,...Object.fromEntries(fields.map(key=>[key,Float32Array.from(selected[key])])),
      algorithm:'endpoint-copy',nativeTrajectoryVerified:false};
  }
  check(coupled);check(separate);
  if(coupled.columns!==separate.columns)throw new RangeError('Matching endpoint columns required');
  const rows=Math.min(coupled.rows,separate.rows),columns=coupled.columns,w=endpointSineWeights(t);
  const out=Object.fromEntries(fields.map(key=>[key,new Float32Array(rows*columns)])),permutations=[];
  for(let c=0;c<columns;c++){
    const left={},right={};
    for(const field of fields){
      left[field]=Array.from({length:rows},(_,r)=>Math.fround(coupled[field][r*columns+c]));
      right[field]=Array.from({length:rows},(_,r)=>Math.fround(separate[field][r*columns+c]));
    }
    const mixed={};
    for(const field of ['frequency','decay'])mixed[field]=left[field].map((a,r)=>fma32(a,w.coupled,Math.fround(right[field][r]*w.separate)));
    mixed.amplitude=morphEndpointAmplitudes(left.amplitude,right.amplitude,t,-40);
    mixed.phase=morphPairedEndpointPhases(left.phase,right.phase,t,endpointAmplitudeTypes(left.amplitude,right.amplitude));
    const {indices}=sortEndpointFrequencyIndices(mixed.frequency);permutations.push(indices);
    for(let r=0;r<rows;r++)for(const field of fields)out[field][r*columns+c]=mixed[field][indices[r]];
  }
  return {rows,columns,...out,permutations,algorithm:'row-paired-endpoint-morph',nativeTrajectoryVerified:false};
}
