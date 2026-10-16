// Calculated stereo route -> settled output level -> native PCM prefix comparison.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {applySettledOutputLevel} from '../dsp/output-level.mjs';
import {encodeObservedPcm24} from '../dsp/pcm24.mjs';
const args=process.argv.slice(2),[capturePath,reportPath]=args;
const options={};for(let i=2;i<args.length;i+=2){if(!['--stereo-report','--reference-wav','--output-wav'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid output volume options');options[args[i]]=args[i+1];}
if(!capturePath||!reportPath||!options['--stereo-report']||!options['--reference-wav'])throw new Error('Usage: capture.json report.json --stereo-report computed-stereo.json --reference-wav official.wav [--output-wav prefix.wav]');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8')),source=JSON.parse(fs.readFileSync(options['--stereo-report'],'utf8'));
if(!data.windowComplete||data.errors.length||!source.passed||source.mismatches||source.blocks!==data.ordinalLimit||data.records.length!==2*data.ordinalLimit)throw new Error('Complete verified output captures required');
const word=new DataView(new ArrayBuffer(4)),bits=x=>{word.setFloat32(0,x);return word.getUint32(0);};
let count=0,mismatches=0;const failures=[],predictions=[],pcmParts=[];
function check(name,p,a){
 if(p.length!==a.length)throw new Error('Output length differs');
 for(let i=0;i<p.length;i++){
  count++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite output');
  if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}
 }
}
const state=data.records[0].state;
for(let n=0;n<data.ordinalLimit;n++){
 const [entry,returned]=data.records.slice(n*2,n*2+2),up=source.predictions[n];
 if(entry.stage!=='entry'||returned.stage!=='returned'||entry.ordinal!==n||returned.ordinal!==n||up.ordinal!==n)throw new Error('Output chronology differs');
 if(entry.matrix.rows!==2||entry.matrix.samples!==64||returned.matrix.rows!==2||returned.matrix.samples!==64)throw new Error('Output shape differs');
 check(`${n}:stateBefore`,state,entry.state);check(`${n}:stateAfter`,state,returned.state);
 const output=applySettledOutputLevel(up.stereo,state);
 for(let row=0;row<2;row++){
  check(`${n}:${row}:input`,up.stereo[row],entry.matrix.values[row]);
  check(`${n}:${row}:output`,output[row],returned.matrix.values[row]);
 }
 pcmParts.push(Buffer.from(encodeObservedPcm24(output)));predictions.push({ordinal:n,output:output.map(row=>[...row])});
}
const pcm=Buffer.concat(pcmParts),wav=fs.readFileSync(options['--reference-wav']);
if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw new Error('Reference WAV required');
let format,audio;
for(let p=12;p+8<=wav.length;){const size=wav.readUInt32LE(p+4),id=wav.toString('ascii',p,p+4);if(p+8+size>wav.length)throw new Error('Truncated WAV');if(id==='fmt ')format=wav.subarray(p+8,p+8+size);if(id==='data')audio=wav.subarray(p+8,p+8+size);p+=8+size+(size&1);}
if(!format||format.readUInt16LE(0)!==1||format.readUInt16LE(2)!==2||format.readUInt32LE(4)!==48000||format.readUInt16LE(14)!==24||!audio||audio.length<pcm.length)throw new Error('Unverified reference format/window');
let pcmDifferences=0,firstPcmDifference=null;
for(let i=0;i<pcm.length;i+=3)if(pcm.readIntLE(i,3)!==audio.readIntLE(i,3)){pcmDifferences++;if(firstPcmDifference===null)firstPcmDifference=i/3;}
const report={passed:!mismatches&&!pcmDifferences,count,matched:count-mismatches,mismatches,windowComplete:true,blocks:data.ordinalLimit,
 pcmPrefixFrames:pcm.length/6,pcmPrefixComparedInterleavedSamples:pcm.length/3,pcmPrefixDifferences:pcmDifferences,firstPcmDifference,
 pcmPrefixSha256:crypto.createHash('sha256').update(pcm).digest('hex'),settledLevel:state[0],calculatedStereoInput:true,
 postProcessingBeforeStereoStillObserved:true,roomProcessingComputed:!!source.roomProcessingComputed,earlierCabinetMixStillObserved:!!source.earlierCabinetMixStillObserved,floatToSigned32InstructionIdentityRecovered:true,packed24InstructionIdentityRecovered:false,completeVoiceOrBrowserEquivalence:false,predictions,failures};
if(options['--output-wav']){
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(288000,28);header.writeUInt16LE(6,32);header.writeUInt16LE(24,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);fs.writeFileSync(options['--output-wav'],Buffer.concat([header,pcm]));
}
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,predictions:undefined,failures:undefined}));
if(!report.passed)process.exitCode=1;
