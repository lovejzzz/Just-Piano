// 460acc -> Rattle entry: terminal group gain and explicit processor bypasses.
import {scaleVoiceGroups} from './voice-output-delay.mjs';
export function processVoiceMidGroups(groups,c){
 if(groups.length!==3||groups.some(g=>g.length!==64||!g.every(Number.isFinite))||![c.level,c.gain,c.envelopeEnabled,c.filterEnabled].every(Number.isFinite))throw new Error('Finite aligned voice mid inputs required');
 for(const k of ['mergeEnabled','primaryProcessorEnabled'])if(!Number.isInteger(c[k])||c[k]<0||c[k]>255)throw new Error('Mid processor byte flags required');
 if(c.mergeEnabled===1&&(c.mergeCurrent!==0||c.mergeRemaining!==0))throw new Error('Active merge processor not implemented');
 if(c.primaryProcessorEnabled===1||c.envelopeEnabled!==0||c.filterEnabled!==0||c.eqSections!==0)throw new Error('Active mid processing branch not implemented');
 if(!Number.isInteger(c.eqChannels)||c.eqChannels<0||c.eqChannels>16)throw new Error('Invalid EQ channel count');
 return scaleVoiceGroups(groups,c.level,c.gain);
}
