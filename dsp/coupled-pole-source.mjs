// 194870 coupled route, with own impedance/jitter and finite native N1/N2/N3 poles.
import {modePoleInputs,constructModalSource,sourcePhaseTable} from './modal-source.mjs';
import {couplingArguments} from './coupling-inputs.mjs';
import {modalImpedance,couplingJitterFactors} from './modal-impedance.mjs';
import {nativeImpedanceMath} from './native-impedance-math.mjs';
import {coupledModes} from './modal-poles.mjs';
import {archiveImpedanceSource} from './archive-impedance-source.mjs';
import {singleComponentPole} from './single-component-pole.mjs';
const f=Math.fround;
export function constructCoupledPoles({prepared,coordinateScale,coordinates,note,
  frequencyGrid,runtimeCurveModes,impedance,jitterAmount,sampleRate,frequencyCutoff,archiveContext,polynomialControls}){
  const endpoints=prepared?.endpoints?.filter(e=>e.kind==='coupled'),columns=prepared?.scaledOffsets?.length;
  if(!(prepared?.blend>0)||!Array.isArray(endpoints)||endpoints.length!==1||![1,2,3].includes(columns)||
    endpoints[0].offsets?.length!==columns||endpoints[0].spread?.length!==columns||!coordinates||
    ![prepared.fundamental,coordinateScale,note,jitterAmount,sampleRate,frequencyCutoff].every(Number.isFinite)||
    !(prepared.fundamental>0)||!(f(coordinateScale)>0)||!(f(sampleRate)>0)||!(f(frequencyCutoff)>0)||
    [...coordinates].some(x=>!Number.isFinite(f(x))||!(f(x)>0)))
    throw new RangeError('Complete coupled N1/N2/N3 endpoint, positive coordinates and explicit finite source controls required');
  if(columns>=2&&(!polynomialControls||!['kappa','gamma','decayFloorRatio'].every(k=>Number.isFinite(polynomialControls[k]))||!(polynomialControls.decayFloorRatio>0)))
    throw new RangeError('Explicit finite polynomial kappa/gamma and positive decay floor ratio required');
  if(archiveContext!==undefined){
    if([frequencyGrid,runtimeCurveModes,impedance].some(x=>x!==undefined))throw new RangeError('Archive impedance source cannot mix with supplied intermediate controls or curves');
    const own=archiveImpedanceSource({...archiveContext,note});
    if(own.componentCount!==columns)throw new RangeError('Archive and prepared endpoint component counts differ');
    ({frequencyGrid,runtimeCurveModes,impedance}=own);
  }
  const endpoint=endpoints[0],threshold=Math.min(f(frequencyCutoff),f(f(sampleRate)*.5))*.99;
  const factors=couplingJitterFactors(note,jitterAmount,coordinates.length),frequency=[],rawDecay=[],traces=[];
  for(let row=0;row<coordinates.length;row++){
    const mode=f(coordinates[row]),inputs=modePoleInputs({...endpoint,mode});
    if(inputs.center>=threshold)break;
    const args=couplingArguments({fundamental:prepared.fundamental,endpoint,coordinateScale,mode,note,frequencyGrid,runtimeCurveModes});
    const {s0,s1,s2,s3}=args.inputs;
    const own=modalImpedance({...impedance,fundamental:s0,reference:s1,frequency:s2,extraDb:s3},nativeImpedanceMath);
    const factor=factors[row],p=own.p*factor,q=own.q*factor;
    // 194b04..0c saves d2 for 194d5c: base * float32(coordinateScale).
    // N1 consumes that reference; N>=2 uses the row coordinate in d4 instead.
    const singleComponentReference=endpoint.base*f(coordinateScale);
    const result=columns===1
      ? singleComponentPole({p,q,mode:singleComponentReference,center:inputs.center})
      : coupledModes(inputs.lambda,{p,q,mode,center:inputs.center,kappa:polynomialControls.kappa,
        gamma:polynomialControls.gamma,decay_floor_ratio:polynomialControls.decayFloorRatio,rootAlgorithm:'native-qr'});
    frequency.push(...result.frequency);rawDecay.push(...result.decay);
    traces.push({row,mode,center:inputs.center,lambda:inputs.lambda,inputs:args.inputs,impedanceP:own.p,impedanceQ:own.q,
      factor,p,q,coefficients:result.coefficients,roots:result.solver?.roots,rootAlgorithm:result.solver?.algorithm??result.algorithm,
      frequency:result.frequency,rawDecay:result.decay,...(columns===1?{singleComponentReference}:{})});
  }
  return {rows:traces.length,columns,frequency:Float32Array.from(frequency),rawDecay:Float32Array.from(rawDecay),
    rowLimit:coordinates.length,threshold,traces,impedanceAndPolesComputed:true,impedanceFromArchive:archiveContext!==undefined,
    polynomialControlsRequired:columns>=2,nativeCoupledTrajectoryVerified:false};
}
export function constructCoupledSource({prepared,poleControls,weights,amplitudeControls,phaseAmount,phaseConstant,componentPoles,components,frequency,rawDecay}){
  if([componentPoles,components,frequency,rawDecay].some(x=>x!==undefined))throw new RangeError('Computed coupled source cannot use supplied pole or component tables');
  if(!amplitudeControls||!['addedDecay','shape','eta','integerScale'].every(k=>Number.isFinite(amplitudeControls[k]))||
    ![phaseAmount,phaseConstant].every(Number.isFinite))throw new RangeError('Explicit coupled amplitude and phase controls required');
  const poles=constructCoupledPoles({...poleControls,prepared});
  if(!weights||weights.length<poles.rows||[...weights].some(x=>!Number.isFinite(f(x))))throw new RangeError('Sufficient finite own harmonic weights required');
  const source=poles.rows?constructModalSource({...poles,...amplitudeControls,weights,phaseAmount,phaseConstant,
    referenceFrequency:prepared.endpoints.find(e=>e.kind==='coupled').referenceFrequency}):
    {rows:0,columns:poles.columns,frequency:poles.frequency,rawDecay:poles.rawDecay,decay:new Float32Array(),amplitude:new Float32Array(),phase:sourcePhaseTable(0,poles.columns,phaseAmount,phaseConstant)};
  return {...source,poles,coupledPolesComputed:true,coupledImpedanceFromArchive:poles.impedanceFromArchive,completeVoiceVerified:false};
}
