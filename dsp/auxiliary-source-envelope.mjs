import {AuxiliaryTableSource64} from './auxiliary-table-source.mjs';
import {initializeTerminalVoiceEnvelope,renderTerminalVoiceEnvelope} from './voice-tail-envelopes.mjs';
const f = Math.fround, minimum = new Float32Array(new Uint32Array([0x38d1b717]).buffer)[0];
// 4609dc..460a48: source state is owned; raw gain-control production is separate.
export class AuxiliarySourceEnvelope64 {
  constructor(profiles, tables, {sampleRate, initialScale, releaseAge, quietLimit, quietThreshold}) {
    if (profiles.length !== 3 || !Number.isInteger(releaseAge) || releaseAge < 0 || releaseAge % 64)
      throw Error('Three sources and MIDI release age required');
    this.sources = profiles.map(p => new AuxiliaryTableSource64(p, tables));
    this.envelope = initializeTerminalVoiceEnvelope(sampleRate, 0, initialScale);
    this.releaseAge = releaseAge; this.age = 0;
    if (!Number.isInteger(quietLimit) || quietLimit < 0 || !Number.isFinite(quietThreshold) || quietThreshold <= 0)
      throw Error('Explicit auxiliary quiet profile required');
    this.quietLimit=quietLimit;this.quietThreshold=f(quietThreshold);this.quietCounter=0;this.parentSkip=0;
  }
  prepareEvent() { this.envelope.enabled = this.age >= this.releaseAge ? 1 : 0; }
  process64(controls) {
    this.prepareEvent();
    if (![controls.numerator, controls.denominator].every(Number.isFinite) ||
        ['voiceFlags','parentSkip','voiceSkip'].some(k => !Number.isInteger(controls[k]) || controls[k] < 0 || controls[k] > 255))
      throw Error('Bounded auxiliary gain controls required');
    let rows = this.sources.map(s => s.process64());
    const quiet=rows.every(row=>row.every(value=>Math.abs(value)<this.quietThreshold));
    this.quietCounter=quiet?(this.quietCounter+64)>>>0:0;
    if(this.sources[0].pastFirstThird&&this.quietCounter>=this.quietLimit)this.parentSkip=1;
    else if(this.envelope.ready===1&&this.envelope.gain<this.envelope.target){
      this.parentSkip=1;rows=rows.map(()=>new Float32Array(64));
    }
    if (controls.voiceFlags & 4 && !(this.parentSkip & 1) && !(controls.voiceSkip & 1)) {
      if (controls.numerator !== 0) {
        const scale = f(f(controls.numerator) / Math.max(f(controls.denominator), minimum));
        if (this.envelope.slope !== 0 || this.envelope.scale !== scale) {
          this.envelope.slope = 0; this.envelope.scale = scale; this.envelope.ready = 0;
        }
      }
      rows = renderTerminalVoiceEnvelope(Array.from({length:3}, () => new Float32Array(64)), rows, this.envelope).auxiliary;
    }
    this.age += 64; return rows;
  }
}
