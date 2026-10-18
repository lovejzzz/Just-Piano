// Comparison-only audit. Native table hashes never select engine prediction inputs.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {generateAuxiliaryBank} from '../dsp/auxiliary-generated-bank.mjs';
const [archivePath,captureDirectory,reportPath,...flags]=process.argv.slice(2);
if(!archivePath||!captureDirectory||!reportPath)throw Error('Usage: current-archive.json native-capture-directory NEW-report.json');
if(flags.some(f=>f!=='--poison-comparison-target'))throw Error('Unknown verification flag');
if(fs.existsSync(reportPath))throw Error('New audit output required');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const archiveBytes=fs.readFileSync(archivePath),archive=JSON.parse(archiveBytes);
const groups=archive.baseFields.find(r=>r.object_offset===0x1e80)?.value.filter(g=>g.integer20===1);
if(groups?.length!==1)throw Error('One current generated kind1 group required');
// Complete calculation happens before native observations are opened.
const bank=generateAuxiliaryBank(groups[0]),generated=[...bank.values()].map(r=>{
 const bytes=Buffer.from(r.samples.buffer,r.samples.byteOffset,r.samples.byteLength);
 return {...r,samples:undefined,storageSamples:r.samples.length,sha256:sha(bytes),bytes};
});
const runtimePath=path.join(captureDirectory,'runtime.json'),runtimeBytes=fs.readFileSync(runtimePath),runtime=JSON.parse(runtimeBytes);
// This audit is specifically the pass294 NY 2-second kind1 bank fixture.
const targets=Object.values(runtime.tables).filter(t=>t.count===96000);
if(targets.length!==9)throw Error('Expected all nine observed NY kind1 tables');
let poisoned=false;
const comparisons=targets.map(t=>{
 if(path.basename(t.file)!==t.file)throw Error('Local table basename required');
 const bytes=fs.readFileSync(path.join(captureDirectory,t.file));
 if(bytes.length!==t.count*4||sha(bytes)!==t.sha256)throw Error('Native comparison target binding differs');
 if(flags.includes('--poison-comparison-target')&&!poisoned){bytes[16]^=1;poisoned=true;}
 const comparedSha256=sha(bytes),matches=generated.filter(g=>g.sha256===comparedSha256&&g.bytes.equals(bytes));
 return {table:t.file,storageSamples:t.count,sha256:t.sha256,comparedSha256,matched:matches.length===1,
  matches:matches.map(({identity,key,variant})=>({identity,key,variant}))};
});
const report={schema:1,archiveSha256:sha(archiveBytes),runtimeSha256:sha(runtimeBytes),
 generatedBankUsesNativeInputs:false,nativeTablesAreComparisonOnly:true,integratedIntoStereo:false,
 poisonedComparisonTarget:poisoned,
 generated:generated.map(({bytes,...r})=>r),comparisons,
 comparedSamples:comparisons.reduce((n,r)=>n+r.storageSamples,0),
 unmatchedTables:comparisons.filter(r=>!r.matched).length};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({generated:generated.length,comparedSamples:report.comparedSamples,unmatchedTables:report.unmatchedTables}));
if(report.unmatchedTables)process.exitCode=1;
