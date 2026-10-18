// 3e1e88: scalar pedal selection, falling-edge rearm, and held-value override.
const f = Math.fround;
const maximum = (a,b) => a < b ? b : a;
export class GlobalPedalControl {
  constructor({sampleRate,samples,threshold,forceExtra,bodyEnabled,excitationEnabled}) {
    if (!Number.isFinite(sampleRate)||sampleRate<=0||!Number.isInteger(samples)||samples<=0||
        !Number.isFinite(threshold)||![forceExtra,bodyEnabled,excitationEnabled].every(x=>Number.isInteger(x)&&x>=0&&x<=255))
      throw Error('Explicit scalar clock and static configuration required');
    this.sampleRate=f(sampleRate);this.samples=samples;this.threshold=f(threshold);this.forceExtra=forceExtra;
    this.bodyEnabled=bodyEnabled;this.excitationEnabled=excitationEnabled;
    this.previousAbove=0;this.rearmRemaining=0;this.holdRemaining=0;this.holdValue=0;this.effective=0;
  }
  hold(value,frames) {
    if(!Number.isFinite(value)||!Number.isInteger(frames)||frames<0||frames>0xffffffff)throw Error('Explicit held-value event required');
    this.holdValue=f(value);this.holdRemaining=frames;
  }
  process(pedal,extraPedal) {
    if(![pedal,extraPedal].every(Number.isFinite))throw Error('Finite pedal inputs required');
    pedal=f(pedal);extraPedal=f(extraPedal);
    let value=maximum(pedal,(this.forceExtra&1)?1:extraPedal);
    if(pedal<=this.threshold&&this.previousAbove===1) {
      const count=Math.trunc(this.sampleRate*0.3);
      if(count>0x7fffffff)throw Error('Rearm count outside inspected signed range');
      this.rearmRemaining=count;
    }
    this.previousAbove=pedal>this.threshold?1:0;
    if(this.rearmRemaining>0) {value=pedal;this.rearmRemaining-=Math.min(this.samples,this.rearmRemaining);}
    this.effective=value;
    if(this.holdRemaining!==0) {this.holdRemaining=Math.max(0,this.holdRemaining-this.samples);value=maximum(value,this.holdValue);}
    return {output:value,effective:this.effective,shouldUpdate:!!((this.bodyEnabled&1)||this.excitationEnabled===1)};
  }
}
