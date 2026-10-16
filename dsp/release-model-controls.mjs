// 43dcb0: release-control initialization from source configuration and a
// selected decay row. This is not a mechanical felt-contact force model.
const f=Math.fround;
const bits=new DataView(new ArrayBuffer(4));bits.setUint32(0,0x40135d8e);const LN10=bits.getFloat32(0);
export function initializeReleaseModel({duration,polynomialTail,gainScale,cubicScale,cubicGainScale,sampleRate,decayRows,selectedDecayRow}){
 if(!Array.isArray(polynomialTail)||polynomialTail.length!==4||![duration,gainScale,cubicScale,cubicGainScale,sampleRate,...polynomialTail].every(Number.isFinite)||duration<=0||sampleRate<=1000||!Number.isInteger(decayRows)||decayRows<0)throw new RangeError('Supported finite release model sources required');
 let correction=0;
 if(decayRows!==0){
  if(!Array.isArray(selectedDecayRow)||!selectedDecayRow.length||!selectedDecayRow.every(Number.isFinite))throw new RangeError('Finite selected decay row required');
  const minimum=Math.max(1,Math.min(...selectedDecayRow.map(f)));
  correction=f(f(f(minimum*20)*f(duration))/LN10);
 }
 return {polynomial:[f(duration),...polynomialTail.map(f)],rateScale:Math.max(0,f(90-correction)),gainScale:f(gainScale),cubicScale:f(cubicScale),cubicGainScale:f(cubicGainScale),timestep:f(1/f(sampleRate))};
}
