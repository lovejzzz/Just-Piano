import fs from 'node:fs';
import crypto from 'node:crypto';
import {forwardReal128} from '../dsp/real-fft-finalize.mjs';
const [sourcePath,targetPath,outputPath,...extra]=process.argv.slice(2);
if(!sourcePath||!targetPath||!outputPath||extra.length)throw new Error('Usage: earlier-fft-capture.json scheduler-capture.json output.json');
const sourceBytes=fs.readFileSync(sourcePath),targetBytes=fs.readFileSync(targetPath),source=JSON.parse(sourceBytes),target=JSON.parse(targetBytes);
if(!source.windowComplete||source.errors.length||!target.windowComplete||target.errors.length)throw new Error('Complete kernel evidence required');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const bytesOf=a=>{const b=Buffer.alloc(a.length*4);a.forEach((x,i)=>b.writeFloatLE(x,i*4));return b;};
const inputs=new Map();let initialTransforms=0;
for(const [recordIndex,r] of source.records.entries()){
 if(r.stage==='product')break;
 if(r.stage!=='fftEntry'||r.direction!==0)continue;
 const key=sha(bytesOf(forwardReal128(r.input))),inputBits=[];
 // Read explicitly as little endian, preserving negative zero in the evidence.
 const bytes=bytesOf(r.input);inputBits.length=0;for(let i=0;i<r.input.length;i++)inputBits.push(bytes.readUInt32LE(i*4));
 const old=inputs.get(key);if(old&&JSON.stringify(old.inputBits)!==JSON.stringify(inputBits))throw new Error('Ambiguous kernel time producer');
 inputs.set(key,{sourceRecordIndex:recordIndex,sourceFftOrdinal:initialTransforms,inputBits});initialTransforms++;
}
const kernels={};let matched=0;
for(const [bank,c] of Object.entries(target.configs)){
 kernels[bank]={};
 for(const ring of c.kernels)if(ring)for(const slot of ring.slots)if(!slot.empty){
  const producer=inputs.get(sha(bytesOf(slot.data)));if(!producer)throw new Error('Kernel has no calculated earlier FFT producer');
  kernels[bank][slot.object]=producer;matched++;
 }
}
fs.writeFileSync(outputPath,JSON.stringify({schema:1,crossRunInitialization:true,sourceCapture:sourcePath,sourceSha256:sha(sourceBytes),targetSha256:sha(targetBytes),initialTransforms,matched,kernels},null,2)+'\n');
console.log(JSON.stringify({initialTransforms,matched,crossRunInitialization:true}));
