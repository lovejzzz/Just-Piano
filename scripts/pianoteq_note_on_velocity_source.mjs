// Explicit historical MIDI/branch reconstruction; not a general event scheduler.
import crypto from 'node:crypto';
import {buildManagerEventTables, managerEventCurvesFromArchive} from '../dsp/manager-event-tables.mjs';
import {ExcitationManagerRandom} from '../dsp/excitation-manager-random.mjs';
import {mapManagerEventValue, randomizeManagerEventValue} from '../dsp/manager-event-velocity.mjs';
import {linearModelCurve} from '../dsp/model-curves.mjs';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function readFormatZeroNoteOns(bytes) {
  if (bytes.length < 22 || bytes.toString('ascii',0,4) !== 'MThd' || bytes.readUInt32BE(4) !== 6 ||
      bytes.readUInt16BE(8) !== 0 || bytes.readUInt16BE(10) !== 1 || bytes.readUInt16BE(12) & 0x8000 ||
      bytes.readUInt16BE(12) === 0 || bytes.toString('ascii',14,18) !== 'MTrk' || bytes.readUInt32BE(18) !== bytes.length-22)
    throw new Error('Complete single-track PPQ format-zero MIDI required');
  let position=22, ticks=0, running, ended=false;
  const events=[];
  const byte=()=>{if(position>=bytes.length)throw new Error('Truncated MIDI');return bytes[position++];};
  const vlq=()=>{let n=0;for(let i=0;i<4;i++){const b=byte();n=n*128+(b&127);if(!(b&128))return n;}throw new Error('Invalid MIDI VLQ');};
  while(position<bytes.length){
    ticks+=vlq();let status=byte();
    if(status<128){if(!running)throw new Error('Missing running status');position--;status=running;}
    if(status===0xff){
      running=undefined;const type=byte(), length=vlq();
      if(length>bytes.length-position)throw new Error('Truncated meta event');position+=length;
      if(type===0x2f){if(length!==0||position!==bytes.length)throw new Error('Invalid track ending');ended=true;break;}
    }else if(status===0xf0||status===0xf7){
      running=undefined;const length=vlq();if(length>bytes.length-position)throw new Error('Truncated SysEx');position+=length;
    }else if(status>=0x80&&status<=0xef){
      running=status;const kind=status>>4,a=byte(),b=[0xc,0xd].includes(kind)?undefined:byte();
      if(a>=128||b>=128)throw new Error('Invalid channel event data');
      if(kind===9&&b!==0)events.push({ticks,channel:status&15,note:a,velocity:b});
    }else throw new Error('Unsupported MIDI status');
  }
  if(!ended)throw new Error('Missing end-of-track');
  return {ppq:bytes.readUInt16BE(12),events};
}

export function computeNoteOnVelocitySource(source) {
  if(source?.schema!==1 || source.conditions?.configurationSeed!==0 ||
      source.conditions.eventBranch!=='velocity-randomization-enabled' || source.conditions.useGlobal!==false ||
      source.conditions.runtimeCurveMode!=='linear-clamp' || source.conditions.midiNormalization!=='velocity/128' ||
      source.conditions.kind!==0 || source.conditions.newlyObserved!==false || source.postLookupShaping!==0)
    throw new Error('Explicit historical velocity conditions required');
  const bytes=Buffer.from(source.midiBase64,'base64');
  if(sha(bytes)!==source.midiSha256 || sha(JSON.stringify(source.curves))!==source.curvesSha256)
    throw new Error('Velocity MIDI or curve digest mismatch');
  const midi=readFormatZeroNoteOns(bytes);
  if(midi.events.length!==5||midi.events.some(e=>e.note!==69||e.velocity!==96))
    throw new Error('Only the five A4 velocity-96 historical starts are covered');
  const tables=buildManagerEventTables({...source.curves,useGlobal:false,runtimeMode:'linear-clamp'});
  const manager=new ExcitationManagerRandom({configurationSeed:0,eventBranch:'velocity-randomization-enabled'});
  return {events:midi.events.map((event,epoch)=>{
    const initialization=manager.nextVoice(), raw=Math.fround(event.velocity/128);
    const randomized=randomizeManagerEventValue(raw,initialization.velocityWord,{kind:0,eligible:true});
    return {...event,epoch,raw,randomized,initialization,
      velocity:mapManagerEventValue(randomized,{kind:0,table:tables.noteOn})};
  }),tableSha256:sha(Buffer.from(new Float32Array(tables.noteOn).buffer)),managerDraws:manager.draws};
}

export function prepareNoteOnVelocitySource(midiBytes, base, preset) {
  const fields=preset.decoded_tail?.fields, a=new Map(fields?.map(row=>[row.object_offset,row.value]));
  const noteShape=linearModelCurve(a.get(0xed0),69,{runtimeMode:'linear-clamp'});
  if(!Number.isFinite(a.get(0xec8))||noteShape.length!==1||
      Math.max(-1,Math.min(1,Math.fround(Math.fround(a.get(0xec8))+noteShape[0])))!==0)
    throw new Error('Only the explicit zero post-lookup shaping branch is covered');
  const curves=managerEventCurvesFromArchive({baseFields:base.fields,presetFields:fields});
  const source={schema:1,conditions:{configurationSeed:0,eventBranch:'velocity-randomization-enabled',
    useGlobal:false,runtimeCurveMode:'linear-clamp',midiNormalization:'velocity/128',kind:0,newlyObserved:false},
    postLookupShaping:0,midiBase64:midiBytes.toString('base64'),midiSha256:sha(midiBytes),
    curves,curvesSha256:sha(JSON.stringify(curves))};
  return {source,...computeNoteOnVelocitySource(source)};
}
