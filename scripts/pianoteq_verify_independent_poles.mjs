import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {prepareModalInputs} from '../dsp/modal-source.mjs';
import {constructIndependentPoles} from '../dsp/independent-pole-source.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('Oracle and NEW report required');
const f=Math.fround,view=new DataView(new ArrayBuffer(8));
const fhex=x=>{view.setFloat32(0,x);return view.getUint32(0).toString(16).padStart(8,'0');};
const dhex=x=>{view.setFloat64(0,x);return view.getBigUint64(0).toString(16).padStart(16,'0');};
let seed=0x194870;function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const unit=()=>random()/4294967296,cases=[],rows=[];
for(let i=0;i<1000;i++){
 const count=1+random()%3,fundamental=f(40+unit()*2000),coordinateScale=f(.2+unit()*1.5),power=f(.01+unit()*10),curveDb=f(unit()*40-20),phase=f(unit()*150-75);
 const prepared=prepareModalInputs({frequency:fundamental,offsets:Array.from({length:count},()=>f(unit()*2-1)),offsetExponent:0,
  stiffness:unit()*.001,componentStiffness:[f(unit()*.001)],spread:f(unit()*.01),frequencyRatios:[f(.7+unit()*.8)],blend:i%2===0?0:.5});
 const impedance={strength:f(.1+unit()*10),minimumReference:f(5+unit()*5000),tilt:f(unit()*4-2),mixture:f(unit()),polarRadius:f(.2+unit()),
  phaseCurve:{x:[],y:[phase],flags:0,special:0,dimension:1},bandFrequencies:[],bandDb:[]};
 const args={prepared,coordinateScale,coordinates:[1,2,3,4,5,6,7,8],note:f(unit()*127),jitterAmount:f(unit()*.1),sampleRate:48000,
  frequencyCutoff:f(3000+unit()*20000),frequencyGrid:{coordinates:[69],curves:[{x:[],y:[curveDb]}]},
  runtimeCurveModes:[{flags:0,special:0,dimension:1}],componentPowerScale:[power],impedance};
 const own=constructIndependentPoles(args);cases.push(own);
 for(const trace of own.traces){
  const endpoint=prepared.endpoints.find(e=>e.kind==='separate'&&e.component===trace.component);
  const values=[endpoint.base,endpoint.stiffness,endpoint.spread[0],args.coordinates[trace.row],coordinateScale,fundamental,power,curveDb,args.note,args.jitterAmount,
   impedance.strength,impedance.minimumReference,impedance.tilt,impedance.mixture,impedance.polarRadius,phase];
  rows.push({caseIndex:i,trace,line:[trace.row,...values.map(dhex)].join(' ')});
 }
}
const input=rows.map(x=>x.line).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:32*1024*1024});
if(run.status!==0)throw new Error('Pole oracle failed '+run.stderr);
const lines=run.stdout.trim().split('\n');if(lines.length!==rows.length)throw new Error('Incomplete oracle');
let mismatches=0;const failures=[];
for(let i=0;i<rows.length;i++){
 const trace=rows[i].trace,tokens=lines[i].split(' ');if(tokens.shift()!=='ok'||tokens.length!==12)throw new Error('Malformed oracle row');
 const own=[...['s0','s1','s2','s3'].map(k=>fhex(trace.inputs[k])),fhex(trace.frequency),fhex(trace.rawDecay),
  ...['center','impedanceP','impedanceQ','factor','p','q'].map(k=>dhex(trace[k]))];
 for(let c=0;c<own.length;c++)if(own[c]!==tokens[c]){mismatches++;if(failures.length<15)failures.push({i,caseIndex:rows[i].caseIndex,component:trace.component,row:trace.row,column:c,own:own[c],oracle:tokens[c]});}
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const report={passed:mismatches===0,cases:cases.length,activePoles:rows.length,float32Comparisons:rows.length*6,doubleComparisons:rows.length*6,mismatches,failures,
 corpusSha256:sha(input),outputSha256:sha(run.stdout),oracleSha256:sha(fs.readFileSync(oracle)),
 scope:'Independent C/system math constant curves/no bands and explicit prepared endpoints; not native independent voice capture',
 nativeIndependentTrajectoryVerified:false,wholeAudioVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
