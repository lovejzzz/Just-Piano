// 472f20: carried modal release-progress control (not mechanical felt force).
const f=Math.fround;
export class ReleaseProgressEnvelope{
 constructor(initial){
  if(!Number.isFinite(initial)||initial<0||initial>1)throw new RangeError('Observed initial release progress required');
  this.position=f(initial);this.samplesProcessed=0;this.blocks=0;this.activeBlocks=0;this.clampedBlocks=0;
 }
 process({timestep,duration,baseDuration,samples}){
  if(![timestep,duration,baseDuration].every(Number.isFinite)||!Number.isInteger(samples)||samples<1||samples>512||timestep<=0||duration<0)throw new RangeError('Supported finite envelope controls required');
  duration=f(duration);this.blocks++;this.samplesProcessed=(this.samplesProcessed+samples)>>>0;
  if(duration!==0){
   this.activeBlocks++;
   if(this.position<1){
    const denominator=Math.min(duration,f(f(baseDuration)*5));
    if(!(denominator>0))throw new RangeError('Positive active envelope duration required');
    const delta=f(f(timestep)*f(samples));
    this.position=Math.min(1,f(this.position+f(delta/denominator)));
   }else this.position=1;
   if(this.position===1)this.clampedBlocks++;
  }
  return this.position;
 }
}
