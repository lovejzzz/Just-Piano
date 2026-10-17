import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {wrapEndpointPhase,morphPairedEndpointPhases,endpointAmplitudeTypes} from '../dsp/endpoint-morph.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('Oracle and NEW report required');
const f=Math.fround,view=new DataView(new ArrayBuffer(4));
const bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const value=x=>{view.setUint32(0,x);return view.getFloat32(0);};
const hex=x=>bits(x).toString(16).padStart(8,'0');
let seed=0x85d044;function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const cases=[],edges=[0,-0,value(1),-value(1),-8,-Math.PI,Math.PI,-2*Math.PI,2*Math.PI,-100,100,value(0x7f7fffff),-value(0x7f7fffff)];
for(const a of edges)for(const b of edges)for(const t of [0,.25,.5,.75,1])for(let type=0;type<4;type++)cases.push([a,b,t,type&1?0:1,type&2?0:1]);
for(let i=0;i<100000;i++){
 let a,b;do{a=value(random());}while(!Number.isFinite(a));do{b=value(random());}while(!Number.isFinite(b));
 cases.push([a,b,f(random()/4294967296),i%2===0?0:1,i%3===0?0:1]);
}
const input=cases.map(row=>row.map(hex).join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:32*1024*1024});
if(run.status!==0)throw new Error('Oracle failed '+run.stderr);
const rows=run.stdout.trim().split('\n');if(rows.length!==cases.length)throw new Error('Incomplete oracle');
let mismatches=0;const failures=[];
for(let i=0;i<cases.length;i++){
 const [a,b,t,aa,ab]=cases[i],types=endpointAmplitudeTypes([aa],[ab]);
 const own=[wrapEndpointPhase(a),wrapEndpointPhase(b),morphPairedEndpointPhases([a],[b],t,types)[0],wrapEndpointPhase(a),wrapEndpointPhase(b),wrapEndpointPhase(-a),wrapEndpointPhase(-b)];
 const words=rows[i].split(' ').map((x,c)=>parseInt(x,c===7?10:16));if(words.length!==8)throw new Error('Invalid oracle row');
 const predicted=[...own.map(bits),types[0]];
 for(let c=0;c<8;c++)if(predicted[c]!==words[c]){mismatches++;if(failures.length<15)failures.push({i,column:c,input:cases[i].map(hex),own:predicted[c].toString(16),oracle:words[c].toString(16)});}
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={passed:mismatches===0,cases:cases.length,float32Comparisons:cases.length*7,typeComparisons:cases.length,mismatches,failures,
 corpusSha256:sha(input),outputSha256:sha(run.stdout),oracleSha256:sha(fs.readFileSync(oracle)),
 scope:'Standalone ARM scalar/SIMD instruction transcriptions and C phase-state mixing; not native Pianoteq trajectory',
 scalarAndVectorUseSameDoublePi:true,mappingAndSortingVerified:false,wholeAudioVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
