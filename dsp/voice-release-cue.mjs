// 76170c: time-windowed release events, source mix and scalar filter histories.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround, minimum=new Float32Array(new Uint32Array([0x38d1b717]).buffer)[0];
export class VoiceReleaseCue64 {
  constructor(profile,tables){
    if(!tables.has(profile.primary)||profile.secondary&&!tables.has(profile.secondary)||profile.gains.length!==2||!profile.gains.every(Number.isFinite))throw Error('Explicit release cue tables and gains required');
    this.primary=Float32Array.from(tables.get(profile.primary));
    this.secondary=profile.secondary?Float32Array.from(tables.get(profile.secondary)):null;
    this.gains=profile.gains.slice();this.counter=0;this.quiet=false;
    this.events=profile.events.map(e=>{
      if(['offset','duration','start'].some(k=>!Number.isInteger(e[k])||e[k]<0)||!Number.isFinite(e.gain)||e.coefficients.length!==5||!e.coefficients.every(Number.isFinite)||e.history.length!==4||e.history.some(v=>v!==0))throw Error('Cold bounded release event required');
      return {...e,coefficients:Float32Array.from(e.coefficients),history:new Float32Array(4)};
    });
  }
  cancelPending(){
    for(const event of this.events)if(this.counter<event.start)event.gain=0;
  }
  process64(){
    const output=new Float32Array(64);
    if(this.quiet)return output;
    const age=this.counter,end=age+64;this.quiet=true;
    for(const e of this.events){
      if(age<=e.start+e.duration)this.quiet=false;
      if(end<=e.start)continue;
      const a=f(this.gains[0]*e.gain),b=f(e.gain*this.gains[1]);
      if(Math.max(a,b)<minimum)continue;
      const begin=Math.max(0,e.start-age),finish=Math.max(0,Math.min(64,e.start+e.duration-age));
      for(let i=begin;i<finish;i++){
        const index=e.offset+Math.max(0,age-e.start)+(i-begin);
        if(index>=this.primary.length)throw Error('Release cue source extent exceeded');
        let x=f(a*this.primary[index]);
        if(this.secondary&&index<this.secondary.length)x=fma32(b,this.secondary[index],x);
        const c=e.coefficients,h=e.history;
        let y=f(c[2]*h[0]);y=fma32(x,c[4],y);y=fma32(c[0],h[1],y);
        y=fma32(c[3],h[2],y);y=fma32(c[1],h[3],y);
        e.history=Float32Array.of(x,h[0],y,h[2]);output[i]=f(y+output[i]);
      }
    }
    this.counter=(age+64)>>>0;return output;
  }
}
