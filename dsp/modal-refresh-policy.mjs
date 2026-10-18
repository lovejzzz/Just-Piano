// Ordinary fixed-position, extraGain=0, blockFactor=1 branch.
// 6e4f5c/6e538c..5428: nonzero position gain keeps refreshing energy-dependent
// damping; gain/rate transitions and pitch/position warmup can also dirty it.
// This owns the decision, not voice scheduling or source/control publication.
const f=Math.fround;
export class ModalRefreshPolicy {
 constructor(){this.counter=0;this.previousGain=0;this.previousRate=0;this.calls=0;this.refreshes=0;this.skips=0;}
 next({counter,logicalModeCount,gain,rate,pitchApplied,positionWarmupDue=false}){
  if(counter!==this.counter||!Number.isSafeInteger(counter)||counter<0||counter%64||
     !Number.isSafeInteger(logicalModeCount)||logicalModeCount<0||logicalModeCount>4096||
     ![gain,rate].every(x=>Number.isFinite(x)&&Number.isFinite(f(x)))||
     typeof pitchApplied!=='boolean'||typeof positionWarmupDue!=='boolean')
   throw Error('Sequential own modal state, finite coefficients and own pitch/warmup decisions required');
  gain=f(gain);rate=f(rate);
  const initial=this.calls===0;
  const required=initial||logicalModeCount>0&&(gain!==0||this.previousGain!==0||
   rate!==this.previousRate||pitchApplied||positionWarmupDue);
  this.previousGain=gain;this.previousRate=rate;this.counter+=64;this.calls++;
  if(required)this.refreshes++;else this.skips++;
  return {required,initial:Number(initial),factor:1,phase:0};
 }
 summary(){return {calls:this.calls,refreshes:this.refreshes,skips:this.skips,nativeRefreshDecisionUsedForPrediction:false,
  profileScope:'ordinary fixed position, extra gain zero, factor one; shape changes covered while gain is nonzero',sourceAndVoiceSchedulingStillExternal:true};}
}
