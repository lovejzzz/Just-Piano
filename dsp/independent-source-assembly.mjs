// 103334..103b10: independent component amplitude scaling and matrix assembly.
import {fma32} from './modal-kernel.mjs';
import {sourceAmplitudeRow,sourcePhaseTable,specialHalfRatioWeights} from './modal-source.mjs';
import {nativeDoublePow} from './native-double-pow.mjs';
const f=Math.fround,fields=['frequency','decay','amplitude','phase'];
const view=new DataView(new ArrayBuffer(4));view.setUint32(0,0x1e3ce508);const tiny=view.getFloat32(0);
// 103448..1034bc: special two half-ratio source selects odd weight entries.
export function independentSourceWeights(weights,frequencyRatios){
  if(!weights||!frequencyRatios||!frequencyRatios.length||
    [...weights,...frequencyRatios].some(x=>!Number.isFinite(f(x))))
    throw new RangeError('Explicit finite weight and ratio vectors required');
  const original=Float32Array.from(weights);
  return specialHalfRatioWeights(original,Array.from(frequencyRatios,f));
}
// Each native independent 182960 invocation has one column and starts its own
// phase RNG. Consume own pole tables and selected weights rather than snapshots.
export function constructIndependentComponents({componentPoles,weights,frequencyRatios,amplitudeControls,phaseAmount,phaseConstant,rowLimit}){
  if(!Array.isArray(componentPoles)||!componentPoles.length||!amplitudeControls||
    !Number.isSafeInteger(rowLimit)||rowLimit<0||
    !['addedDecay','shape','eta','integerScale'].every(k=>Number.isFinite(amplitudeControls[k]))||
    ![phaseAmount,phaseConstant].every(Number.isFinite))
    throw new RangeError('Independent pole tables and explicit amplitude/phase controls required');
  const selected=independentSourceWeights(weights,frequencyRatios);
  const components=componentPoles.map(pole=>{
    if(!pole||pole.columns!==1||!Number.isSafeInteger(pole.rows)||pole.rows<0||pole.rows>rowLimit||
      pole.frequency?.length!==pole.rows||pole.rawDecay?.length!==pole.rows||selected.length<pole.rows||
      [...pole.frequency,...pole.rawDecay].some(x=>!Number.isFinite(f(x))))
      throw new RangeError('Complete single-column poles and sufficient own weights required');
    const decay=new Float32Array(pole.rows),amplitude=new Float32Array(pole.rows);
    for(let row=0;row<pole.rows;row++){
      const own=sourceAmplitudeRow([pole.rawDecay[row]],selected[row],{...amplitudeControls,pow:nativeDoublePow});
      decay[row]=own.decay[0];amplitude[row]=own.amplitude[0];
    }
    return {rows:pole.rows,columns:1,frequency:Float32Array.from(pole.frequency),decay,amplitude,
      phase:sourcePhaseTable(pole.rows,1,phaseAmount,phaseConstant)};
  });
  return {components,selectedWeights:selected,nativeTrajectoryVerified:false};
}
export function assembleIndependentSource({components,componentAmplitudeScale,rowLimit}){
  if(!Array.isArray(components)||!components.length||!componentAmplitudeScale?.length||
    !Number.isSafeInteger(rowLimit)||rowLimit<0||[...componentAmplitudeScale].some(x=>!Number.isFinite(f(x))))
    throw new RangeError('Independent components, nonempty amplitude scales and explicit row limit required');
  let rows=0;
  for(const source of components){
    if(!source||source.columns!==1||!Number.isSafeInteger(source.rows)||source.rows<0||source.rows>rowLimit)
      throw new RangeError('Single-column component within original modal row limit required');
    for(const key of fields)if(source[key]?.length!==source.rows||[...source[key]].some(x=>!Number.isFinite(f(x))))
      throw new RangeError('Complete finite independent component '+key+' required');
    rows=Math.max(rows,source.rows);
  }
  const columns=components.length,out=Object.fromEntries(fields.map(key=>[key,new Float32Array(rows*columns)]));
  const scales=components.map((_,i)=>f(componentAmplitudeScale[Math.min(i,componentAmplitudeScale.length-1)]));
  for(let col=0;col<columns;col++){
    const source=components[col];
    for(let row=0;row<source.rows;row++){
      const index=row*columns+col;
      for(const key of fields)out[key][index]=f(source[key][row]);
      out.amplitude[index]=f(out.amplitude[index]*scales[col]);
    }
    let last=0,previousZero=false;
    for(let row=0;row<rows;row++){
      const index=row*columns+col,zero=out.frequency[index]===0;
      if(zero){
        const delta=f(row-last),origin=last*columns+col;
        out.frequency[index]=fma32(out.frequency[col],delta,out.frequency[origin]);
        out.decay[index]=f(out.decay[origin]+delta);
        out.amplitude[index]=tiny;
        // Native leaves phase unchanged, including an existing zero-frequency
        // row's phase. Newly allocated rows already contain positive zero.
      }else{
        if(previousZero)throw new RangeError('Nonzero component frequency after a zero row violates native layout');
        last=row;
      }
      previousZero=zero;
    }
  }
  return {rows,columns,...out,componentScales:scales,algorithm:'independent-component-assembly',nativeTrajectoryVerified:false};
}
