// 194870's N=1 route: own inputs -> impedance -> per-call jitter -> fast pole.
import {modePoleInputs} from './modal-source.mjs';
import {couplingArguments} from './coupling-inputs.mjs';
import {modalImpedance,couplingJitterFactors} from './modal-impedance.mjs';
import {nativeImpedanceMath} from './native-impedance-math.mjs';
import {singleComponentPole} from './single-component-pole.mjs';
import {archiveImpedanceSource} from './archive-impedance-source.mjs';
const f=Math.fround;
export function constructIndependentPoles({prepared,coordinateScale,coordinates,note,
  frequencyGrid,runtimeCurveModes,componentPowerScale,impedance,jitterAmount,sampleRate,frequencyCutoff,archiveContext}){
  if(!prepared||!(prepared.blend<1)||!Array.isArray(prepared.endpoints)||!coordinates||
    ![prepared.fundamental,coordinateScale,note,jitterAmount,sampleRate,frequencyCutoff].every(Number.isFinite)||
    !(f(sampleRate)>0)||!(f(frequencyCutoff)>0)||!(prepared.fundamental>0)||!(f(coordinateScale)>0)||
    [...coordinates].some(x=>!Number.isFinite(f(x))||!(f(x)>0)))
    throw new RangeError('Prepared independent endpoints, positive coordinates and explicit finite source controls required');
  const endpoints=prepared.endpoints.filter(e=>e.kind==='separate');
  if(endpoints.length!==prepared.scaledOffsets?.length||!endpoints.length||endpoints.some((e,i)=>e.component!==i))
    throw new RangeError('Complete ordered independent endpoints required');
  if(archiveContext!==undefined){
    if([frequencyGrid,runtimeCurveModes,componentPowerScale,impedance].some(x=>x!==undefined))
      throw new RangeError('Archive impedance source cannot mix with supplied intermediate controls or curves');
    const own=archiveImpedanceSource({...archiveContext,note});
    if(own.componentCount!==endpoints.length)throw new RangeError('Archive and prepared endpoint component counts differ');
    ({frequencyGrid,runtimeCurveModes,componentPowerScale,impedance}=own);
  }
  const threshold=Math.min(f(frequencyCutoff),f(f(sampleRate)*.5))*.99;
  // Every native 194870 invocation starts at this same seed, including each
  // independent component. Only the active prefix is consumed by that call.
  const factors=couplingJitterFactors(note,jitterAmount,coordinates.length),traces=[];
  const componentPoles=endpoints.map(endpoint=>{
    const frequency=[],rawDecay=[];
    for(let row=0;row<coordinates.length;row++){
      const mode=f(coordinates[row]),poleInputs=modePoleInputs({...endpoint,mode});
      if(poleInputs.center>=threshold)break;
      const args=couplingArguments({fundamental:prepared.fundamental,endpoint,coordinateScale,mode,note,
        frequencyGrid,runtimeCurveModes,componentPowerScale});
      const {s0,s1,s2,s3}=args.inputs;
      const own=modalImpedance({...impedance,fundamental:s0,reference:s1,frequency:s2,extraDb:s3},nativeImpedanceMath);
      const factor=factors[row],p=own.p*factor,q=own.q*factor;
      const result=singleComponentPole({p,q,mode,center:poleInputs.center});
      frequency.push(result.frequency[0]);rawDecay.push(result.decay[0]);
      traces.push({component:endpoint.component,row,mode,center:poleInputs.center,inputs:args.inputs,
        impedanceP:own.p,impedanceQ:own.q,factor,p,q,frequency:result.frequency[0],rawDecay:result.decay[0]});
    }
    return {rows:frequency.length,columns:1,frequency:Float32Array.from(frequency),rawDecay:Float32Array.from(rawDecay)};
  });
  return {componentPoles,rowLimit:coordinates.length,threshold,traces,
    impedanceAndPolesComputed:true,impedanceFromArchive:archiveContext!==undefined,nativeIndependentTrajectoryVerified:false};
}
