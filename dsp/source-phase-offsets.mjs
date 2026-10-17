// 103dcc..1040dc: G phase controls applied after endpoint morphing.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround;
const names=['globalDegrees','evenOffset','oddDegrees','evenDegrees','oddDelay','evenDelay'];
export function sourcePhaseCoordinate(value){
  const x=f(value);
  if(!Number.isFinite(x))throw new RangeError('Finite float32 modal coordinate required');
  // FCVTZU saturates; UCVTF rounds uint32 back to float before equality.
  const integer=x<=0?0:x>=4294967295?4294967295:Math.trunc(x);
  return {integer,eligible:f(integer)===x,odd:(integer&1)!==0};
}
export function applySourcePhaseOffsets({rows,columns,frequency,phase,coordinates,controls,phaseConstant}){
  if(!Number.isInteger(rows)||rows<0||!Number.isInteger(columns)||columns<1||
    frequency?.length!==rows*columns||phase?.length!==rows*columns||coordinates?.length<rows||!coordinates||
    !Number.isFinite(phaseConstant)||!controls||names.some(k=>!Number.isFinite(f(controls[k]))))
    throw new RangeError('Complete phase matrices, coordinates, six controls and explicit double constant required');
  if([...frequency,...phase].some(x=>!Number.isFinite(f(x))))throw new RangeError('Finite float32 phase/frequency data required');
  const c=Object.fromEntries(names.map(k=>[k,f(controls[k])])),output=Float32Array.from(phase);
  const degrees=phaseConstant/180,twice=phaseConstant+phaseConstant;
  const summary={globalValues:0,evenValues:0,secondColumnValues:0,skippedCoordinates:0};
  if(c.globalDegrees!==0){
    const delta=f(degrees*c.globalDegrees);
    for(let i=0;i<output.length;i++){output[i]=f(output[i]+delta);summary.globalValues++;}
  }
  for(let row=0;row<rows;row++){
    const kind=sourcePhaseCoordinate(coordinates[row]);
    if(!kind.eligible){summary.skippedCoordinates++;continue;}
    if(!kind.odd)for(let col=0;col<columns;col++){
      const index=row*columns+col;output[index]=f(c.evenOffset+output[index]);summary.evenValues++;
    }
    if(columns<2)continue;
    const angle=kind.odd?c.oddDegrees:c.evenDegrees,delay=kind.odd?c.oddDelay:c.evenDelay;
    if(angle===0&&delay===0)continue;
    const degreePart=f(degrees*angle),delayPart=f(twice*delay),index=row*columns+1;
    const correction=fma32(-f(frequency[index]),delayPart,degreePart);
    output[index]=f(correction+output[index]);summary.secondColumnValues++;
  }
  return {phase:output,summary,nativeNonzeroTrajectoryVerified:false};
}
