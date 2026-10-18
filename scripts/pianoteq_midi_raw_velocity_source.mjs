import {MidiRawNodeLifecycle} from '../dsp/midi-raw-node-lifecycle.mjs';
import fs from 'node:fs';import crypto from 'node:crypto';
import {midiBlockClock} from '../dsp/midi-block-clock.mjs';
import {MidiRawNodeVelocities} from '../dsp/midi-raw-node-velocities.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function bindMidiRawVelocitySource(filename){
 const bytes=fs.readFileSync(filename),source=JSON.parse(bytes);
 if(source.schema!=='pianoteq-excitation-archive-inputs-v1'||source.renderConfiguration?.sampleRate!==48000||source.renderConfiguration.blockSize!==64)
  throw Error('Explicit supported current archive/MIDI render contract required');
 for(const [file,digest]of [[source.resourcePath,source.resourceSha256],[source.presetPath,source.presetSha256],[source.midiPath,source.midiSha256]])
  if(sha(fs.readFileSync(file))!==digest)throw Error('Raw velocity archive/MIDI binding changed');
 const eventClock=midiBlockClock(fs.readFileSync(source.midiPath),source.renderConfiguration);
 const config={baseFields:source.baseFields,presetFields:source.presetFields,eventClock};
 const metadata={archiveSourceSha256:sha(bytes),midiSha256:source.midiSha256,presetSha256:source.presetSha256,resourceSha256:source.resourceSha256};
 return {metadata,create(initial,keyIndex){return new MidiRawNodeVelocities(initial,{...config,keyIndex})},createLifecycle(initial,keyIndex){return new MidiRawNodeLifecycle(initial,{...config,keyIndex})}};
}
