// 1c5320 and 714530: source dynamics, outer gain, and the shared velocity curve.
import {linearModelCurve} from './model-curves.mjs';
import {runtimeCurveModeFromArchiveCurve} from './runtime-context-from-archive.mjs';
import {nativeScalarLog10f} from './native-scalar-log10.mjs';
const f=Math.fround;
export function archiveVelocityProducerControls({baseFields,presetFields,note,hostMode,host2fe0}){
 if(!Array.isArray(baseFields)||!Array.isArray(presetFields)||!Number.isFinite(note)||
   ![0,2].includes(hostMode)||!Number.isFinite(host2fe0)||!Number.isFinite(f(host2fe0)))
  throw new RangeError('Decoded archives and explicit supported velocity runtime conditions required');
 const b=new Map(baseFields.map(x=>[x.object_offset,x.value])),a=new Map(presetFields.map(x=>[x.object_offset,x.value]));
 function scalar(map,offset){const value=map.get(offset);if(!Number.isFinite(value)||!Number.isFinite(f(value)))throw new RangeError('Finite archive velocity scalar required');return f(value);}
 function curve(map,offset){
  const c=map.get(offset);runtimeCurveModeFromArchiveCurve(c,'velocity '+offset.toString(16));
  if(!Array.isArray(c.x)||!Array.isArray(c.y)||!c.y.length||
    (c.x.length?c.y.length!==c.x.length:c.y.length!==1)||
    ![...c.x,...c.y].every(x=>Number.isFinite(x)&&Number.isFinite(f(x))))throw new RangeError('Ordinary scalar velocity curve required');
  linearModelCurve(c,note,{runtimeMode:'linear-clamp'});
  return c;
 }
 const dynamics=scalar(a,0xc80),dynamicsOffset=linearModelCurve(curve(a,0xc88),note,{runtimeMode:'linear-clamp'})[0];
 const h=a.get(0x9a8);
 if(h?.version!==10||h.scalars?.length!==5||!Number.isFinite(h.scalars[4]))throw new RangeError('Supported preset hardness compound required');
 const outerGainCoefficient=linearModelCurve(curve(b,0x1a80),note,{runtimeMode:'linear-clamp'})[0];
 const gA0=f(dynamics+dynamicsOffset),gC0=f(f(f(h.scalars[4])/f(.3))*outerGainCoefficient);
 const shared8c=scalar(b,0x168);
 if(shared8c<=1)throw new RangeError('Supported velocity normalization range must exceed one');
 const shared90=f(1/f(nativeScalarLog10f(shared8c)*f(20)));
 const sharedMode=scalar(a,0x1084);
 if(sharedMode!==0)throw new RangeError('Only recovered shared velocity mode zero supported');
 const original=curve(b,0x1788),scale=Math.min(f(dynamics/f(50)),1);
 const velocityCurve={x:original.x.map(f),y:original.y.map(x=>f(f(x)*scale)),dimension:1,log_x:0,special_mode:0};
 const controls={hostMode,host2fe0:f(host2fe0),gA0,gC0,shared8c,shared90,sharedMode,velocityCurve};
 if(![gA0,gC0,shared90,...velocityCurve.y].every(Number.isFinite))throw new RangeError('Finite produced velocity controls required');
 return {controls,curveScale:scale,dynamics,dynamicsOffset,producerControlsFromArchive:true,runtimeConditionsExplicit:true};
}
