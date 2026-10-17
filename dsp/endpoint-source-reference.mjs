// Reference production in 1026dc and normalization in its caller 7a4014.
import {fma64} from './native-double-fma.mjs';
import {referenceModeIndex,normalizeSourceAmplitudes} from './modal-source.mjs';
import {morphEndpointSources} from './endpoint-source-morph.mjs';
import {applySourcePhaseOffsets} from './source-phase-offsets.mjs';
const f=Math.fround;
export function endpointReferenceFrequency(prepared){
  const t=prepared?.blend,endpoints=prepared?.endpoints;
  if(!Number.isFinite(t)||f(t)!==t||t<0||t>1||!Array.isArray(endpoints))
    throw new RangeError('Prepared endpoints and explicit float32 blend required');
  const coupled=endpoints.filter(e=>e.kind==='coupled'),separate=endpoints.filter(e=>e.kind==='separate');
  if(endpoints.length!==coupled.length+separate.length||coupled.length!==(t>0?1:0)||separate.length!==(t<1?prepared.scaledOffsets?.length:0))
    throw new RangeError('Complete selected endpoint references required');
  for(let i=0;i<separate.length;i++)if(separate[i].component!==i)throw new RangeError('Ordered independent components required');
  for(const e of endpoints)if(!Number.isFinite(e.referenceFrequency)||f(e.referenceFrequency)!==e.referenceFrequency)
    throw new RangeError('Finite float32 endpoint reference required');
  if(t===1)return coupled[0].referenceFrequency;
  if(!separate.length)throw new RangeError('Independent endpoint reference required');
  const last=separate.at(-1).referenceFrequency;
  if(t===0)return last;
  return fma64(coupled[0].referenceFrequency,t,last*f(1-t));
}
// Produces the mixed four tables, independent reference row and a separate
// normalized amplitude table. Later G controls require explicit phaseOffsets.
export function prepareEndpointSourceTables({coupled,separate,prepared,phaseOffsets}){
  const referenceFrequency=endpointReferenceFrequency(prepared);
  const mixed=morphEndpointSources({coupled,separate,blend:prepared.blend});
  if(mixed.columns!==prepared.scaledOffsets?.length)throw new RangeError('Prepared component count must match endpoint columns');
  const referenceIndex=referenceModeIndex(mixed.frequency,mixed.columns,referenceFrequency);
  const normalization=mixed.amplitude.length?normalizeSourceAmplitudes(mixed.amplitude):
    {values:new Float32Array(),maximum:0,scale:1};
  const adjusted=phaseOffsets===undefined?undefined:applySourcePhaseOffsets({...phaseOffsets,
    rows:mixed.rows,columns:mixed.columns,frequency:mixed.frequency,phase:mixed.phase});
  return {...mixed,...(adjusted?{phase:adjusted.phase,phaseOffsetSummary:adjusted.summary}:{}),referenceFrequency,referenceIndex,normalizedAmplitude:normalization.values,
    normalizationMaximum:normalization.maximum,normalizationScale:normalization.scale,
    laterPhaseControlsApplied:Boolean(adjusted),completeCacheVerified:false};
}
