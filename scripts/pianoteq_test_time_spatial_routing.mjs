import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
const [capture,audit,sourcePath,directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw new Error('Usage: capture.json resumes.jsonl archive-source.json new-directory');
fs.mkdirSync(directory);fs.copyFileSync(path.join(path.dirname(capture),'commands.lldb'),path.join(directory,'commands.lldb'));
const base=JSON.parse(fs.readFileSync(capture)),source=JSON.parse(fs.readFileSync(sourcePath));
const runner=path.join(import.meta.dirname,'pianoteq_replay_time_spatial_routing.mjs');
function run(c,s,out){return spawnSync(process.execPath,[runner,c,audit,out,'--exp-candidate','--archive-time-source='+s],{encoding:'utf8',maxBuffer:2**20});}
const baselinePath=path.join(directory,'baseline.json');const firstRun=run(capture,sourcePath,baselinePath);if(firstRun.status!==0)throw new Error('Joint baseline failed: '+firstRun.stderr);
const baseline=JSON.parse(fs.readFileSync(baselinePath));if(!baseline.passed||!baseline.spatialToRoutingSameRun||!baseline.sharedContributionBatches||!baseline.timeToSpatialSameRun||!baseline.primaryActiveBlocks||!baseline.postAttackBlocks)throw new Error('Active same-run source coverage required');
const hash=x=>crypto.createHash('sha256').update(stringifyWithNegativeZero({voice:x.predictions,routing:x.routedPredictions})).digest('hex'),expected=hash(baseline),first=(d,stage)=>d.records.find(r=>r.stage===stage);
const cases=[
 ['time-target',(d)=>{first(d,'time').channels[0][10]+=.125;},'one-same'],
 ['merged-target',(d)=>{first(d,'nonlinear').groups[0].values[0][10]+=.125;},'one-same'],
 ['filtered-target',(d)=>{first(d,'filtered').groups[0].values[0][10]+=.125;},'one-same'],
 ['expanded-target',(d)=>{first(d,'expanded').groups[0].values[0][10]+=.125;},'one-same'],
 ['expanded-aux-target',(d)=>{first(d,'expanded').auxiliary.values[0][10]+=.125;},'one-same'],
 ['late-ring-target',(d)=>{d.records.findLast(r=>r.stage==='expanded'&&r.spatial.rows[0].ring).spatial.rows[0].ring[10]+=.125;},'one-same'],
 ['initial-ring-not-seed',(d)=>{first(d,'time').spatial.rows[0].ring[10]+=.125;},'two-same'],
 ['audio-source',(d)=>{first(d,'before').channels[0][10]+=.125;},'different'],
 ['archive-source',(_d,s)=>{s.editFields.find(r=>r.object_offset===0x1470).value.a+=.01;},'different'],
 ['spatial-mix-source',(d)=>{for(const r of d.records)if(r.epoch===0&&r.spatial)r.spatial.controls['0x94']+=.01;},'different'],
 ['tap-source',(d)=>{for(const r of d.records)if(r.epoch===0&&r.spatial)r.spatial.rows[0].tapWords[2]^=1;},'different'],
 ['routed-source-target',(d)=>{first(d,'route').source.values[0][10]+=.125;},'one-same'],
 ['cache-read-target',(d)=>{first(d,'readReturn').matrix.values[0][10]+=.125;},'one-same'],
 ['cache-head-target',(d)=>{first(d,'readReturn').cache.rings[0].head+=64;},'one-same'],
 ['cache-flag-target',(d)=>{first(d,'readReturn').cache.rings[0].flags[0]^=1;},'one-same'],
 ['route-multiplier-source',(d)=>{first(d,'route').entries[0].tapWords[4]=0x3f000000;},'different'],
 ['missing-voice-contribution',(d)=>{d.records.find(r=>r.stage==='readEntry'&&r.contributors.length>1).contributors.pop();},'reject'],
 ['phantom-contribution',(d)=>{first(d,'readEntry').contributors.push({epoch:999,voice:'0x0',counter:0});},'reject'],
 ['read-frame-gap',(d)=>{first(d,'readEntry').readBlock++;},'reject'],
 ['nonzero-destination',(d)=>{first(d,'readEntry').matrix.values[0][10]=.125;},'reject'],
 ['cache-reseed',(d)=>{const keys=d.records.filter(r=>r.stage==='key');keys[1].seeds=structuredClone(keys[0].seeds);},'reject'],
 ['missing-spatial-stage',(d)=>{d.records.splice(d.records.indexOf(first(d,'filtered')),1);},'reject'],
 ['wrong-slot',(d)=>{first(d,'expanded').site.id=6;},'reject'],
 ['unaudited-stop',(d)=>{first(d,'filtered').site.stopId+=1000000;},'reject'],
 ['seventh-slot',(d)=>{d.transitions[0].registered=7;},'reject'],
 ['missing-transition',(d)=>{d.transitions.pop();},'reject'],
 ['unknown-spatial-branch',(d)=>{first(d,'time').spatial.flags['0xbc']=0;},'reject'],
 ['incomplete-matrix',(d)=>{first(d,'filtered').groups[0].values.pop();},'reject'],
];
const results=[];
for(const [name,mutate,expect]of cases){
 const d=structuredClone(base),s=structuredClone(source);mutate(d,s);
 const cp=path.join(directory,'case.json'),sp=path.join(directory,'source.json'),rp=path.join(directory,name+'.json');
 fs.writeFileSync(cp,stringifyWithNegativeZero(d));fs.writeFileSync(sp,stringifyWithNegativeZero(s));const r=run(cp,sp,rp);
 if(r.error||r.signal)throw r.error??new Error('Child terminated by signal');
 const report=fs.existsSync(rp)?JSON.parse(fs.readFileSync(rp)):null,predictionHash=report&&hash(report);
 const valid=expect==='reject'?r.status===1&&!report:r.status===1&&report?.mismatches>0&&(expect==='different'?predictionHash!==expected:predictionHash===expected)&&(!['one-same','two-same'].includes(expect)||report.mismatches===(expect==='one-same'?1:2));
 if(!valid)throw new Error('Unexpected joint result '+name+' '+r.stderr.slice(-800));
 results.push({name,expect,exit:r.status,mismatches:report?.mismatches,predictionHash,error:r.stderr.slice(-600)});
 fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify({baselineChecks:baseline.checks,results},null,2));
}
const result={allExpected:true,cases:results.length,baselineChecks:baseline.checks,predictionHash:expected,results};fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...result,results:undefined}));
