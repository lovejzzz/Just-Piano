const f=Math.fround;
export const soundboardRateRatios=Object.freeze([[1,1],[3,2],[2,1],[3,1],[4,1],[5,1],[8,1],[12,1],[16,1]].map(Object.freeze));

// 0x1005cb874 chooses the nearest ratio, retaining the earlier entry on ties.
// 0x1005fce64 divides the render rate by that ratio with separate f32 operations.
export function constructSoundboardRatePolicy({baseRate,renderRate}){
  if(!Number.isInteger(baseRate)||baseRate<=0||baseRate>0xffffffff||!Number.isFinite(renderRate)||
    !(f(renderRate)>0)||!Number.isFinite(f(renderRate)))throw new RangeError('Finite positive runtime rate configuration required');
  renderRate=f(renderRate);
  const requestedRatio=f(renderRate/f(baseRate));
  if(!Number.isFinite(requestedRatio))throw new RangeError('Finite runtime rate ratio required');
  let selectedRatio=0,distance=Math.min(Math.abs(f(requestedRatio-1)),f(1e10));
  for(let i=1;i<soundboardRateRatios.length;i++){
    const [numerator,denominator]=soundboardRateRatios[i],candidate=Math.abs(f(requestedRatio-f(f(numerator)/f(denominator))));
    if(candidate<distance){distance=candidate;selectedRatio=i;}
  }
  const [numerator,denominator]=soundboardRateRatios[selectedRatio],outputRate=f(f(renderRate*f(denominator))/f(numerator));
  if(!(outputRate>0)||!Number.isFinite(outputRate))throw new RangeError('Finite positive selected output rate required');
  return {baseRate,renderRate,requestedRatio,selectedRatio,numerator,denominator,outputRate};
}
