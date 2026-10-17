import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const [capturePath,sourcePath,directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw new Error('Usage: capture.json decoded-source.json new-directory');
fs.mkdirSync(directory);
const capture=JSON.parse(fs.readFileSync(capturePath)),source=JSON.parse(fs.readFileSync(sourcePath));
const runner=path.join(import.meta.dirname,'pianoteq_replay_archive_time_model.mjs');
function run(name,c,s){
 const cp=path.join(path.dirname(capturePath),`archive-time-${path.basename(directory)}-${name}.json`),sp=path.join(directory,name+'-source.json'),rp=path.join(directory,name+'-report.json');
 // Keep command provenance next to the capture; never overwrite the capture.
 fs.writeFileSync(cp,JSON.stringify(c),{flag:'wx'});fs.writeFileSync(sp,JSON.stringify(s),{flag:'wx'});
 const result=spawnSync(process.execPath,[runner,cp,sp,rp],{encoding:'utf8'});
 if(result.error||result.signal)throw result.error??new Error('Child terminated by signal');
 return {name,exit:result.status,report:fs.existsSync(rp)?JSON.parse(fs.readFileSync(rp)):null};
}
const baseline=run('baseline',capture,source);if(baseline.exit!==0||!baseline.report?.passed)throw new Error('Baseline failed');
const clone=structuredClone,results=[];
function verify(name,c,s,expected,changed){const r=run(name,c,s);if(r.exit!==1||(expected===null?r.report!==null:r.report?.mismatches!==expected)||r.report&&((r.report.predictionHash!==baseline.report.predictionHash)!==changed))throw new Error('Unexpected negative result: '+name);results.push({name,exit:r.exit,mismatches:r.report?.mismatches??null,predictionChanged:r.report?changed:null});}
let c=clone(capture);c.records.find(r=>r.stage==='selection').source.globalAttack+=.01;verify('target',c,source,1,false);
let s=clone(source);s.editFields.find(r=>r.object_offset===0x1470).value.a+=.01;verify('scalar-source',capture,s,5,true);
s=clone(source);s.editFields.find(r=>r.object_offset===0x1470).value.curve_a.y[60]=.1;verify('curve-source',capture,s,5,true);
c=clone(capture);c.records.find(r=>r.stage==='selection').note=69.5;verify('unverified-interpolation',c,source,null,false);
s=clone(source);s.editFields=s.editFields.filter(r=>r.object_offset!==0x1470);verify('missing-object',capture,s,null,false);
s=clone(source);s.presetSha256='0'.repeat(64);verify('preset-identity',capture,s,null,false);
c=clone(capture);c.complete=false;verify('incomplete-capture',c,source,null,false);
const result={passed:true,baselineChecks:baseline.report.checks,cases:results.length,results};fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
