// Compose existing archive producers into a usable impedance configuration.
import {impedanceControls} from './impedance-controls.mjs';
import {archiveCouplingGrid} from './coupling-inputs.mjs';
const f=Math.fround;
function scalarMode(mode){
  if(!mode||![0,1].includes(mode.flags)||mode.special!==0||mode.dimension!==1)
    throw new RangeError('Explicit ordinary scalar curve flags and dimension required');
  return {flags:mode.flags,special:0,dimension:1};
}
export function archiveImpedanceSource({baseFields,presetFields,note,mode,runtimeCurveMode,
  phaseCurveMode,frequencyCurveModes,polarRadius}){
  if(!Array.isArray(baseFields)||!Array.isArray(presetFields)||!Number.isFinite(f(polarRadius))||f(polarRadius)<0)
    throw new RangeError('Decoded base/preset fields and explicit finite polar radius required');
  const phaseMode=scalarMode(phaseCurveMode),source=impedanceControls({baseFields,presetFields,note,mode,runtimeCurveMode});
  const grid=archiveCouplingGrid(baseFields);
  if(!Array.isArray(frequencyCurveModes)||frequencyCurveModes.length!==grid.curves.length)
    throw new RangeError('Explicit frequency curve modes for every archive grid entry required');
  const runtimeCurveModes=frequencyCurveModes.map(scalarMode);
  const power=baseFields.find(x=>x.object_offset===0x2548)?.value?.vectors?.[2];
  if(!power?.length||power.some(x=>!Number.isFinite(f(x))||!(f(x)>0)))throw new RangeError('Positive archive component power vector required');
  const controls=source.controls;
  return {frequencyGrid:grid,runtimeCurveModes,componentPowerScale:Float32Array.from(power),
    impedance:{strength:controls['0x20'],minimumReference:controls['0x38'],tilt:controls['0x50'],mixture:controls['0xc8'],
      phaseCurve:{...source.phaseCurve,...phaseMode},bandFrequencies:Float32Array.from(source.bandFrequencies),bandDb:Float32Array.from(source.bandGains),polarRadius:f(polarRadius)},
    componentCount:source.componentCount,anchors:source.anchors,archiveControlsComputed:true,
    runtimeCurveModesExplicit:true,polarRadiusExplicit:true};
}
